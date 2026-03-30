import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"]);

// Max inline audio size for Gemini (leave buffer below 8MB)
const MAX_INLINE_BYTES = 6.5 * 1024 * 1024;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Convert any audio/video to compact 16kHz mono MP3 for Gemini
function toCompactMp3(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    "-i", inputPath,
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-b:a", "32k",
    "-f", "mp3",
    "-y", outputPath,
  ]);
}

// Split a long MP3 into chunks of ~5 minutes each
async function splitMp3(inputPath: string, chunkDir: string): Promise<string[]> {
  await runFfmpeg([
    "-i", inputPath,
    "-f", "segment",
    "-segment_time", "290",
    "-c", "copy",
    path.join(chunkDir, "chunk_%03d.mp3"),
  ]);
  const files = await fs.readdir(chunkDir);
  return files
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(chunkDir, f));
}

async function transcribeBuffer(audioBuffer: Buffer, mimeType: string, language?: string): Promise<string> {
  const base64 = audioBuffer.toString("base64");
  const langInstruction = language
    ? `Transcribe this audio in the ${language} language. Output only the transcription, no explanations or notes.`
    : "Transcribe this audio accurately. Output only the transcription text, no explanations or notes.";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: langInstruction },
        ],
      },
    ],
    config: { maxOutputTokens: 8192 },
  });

  return response.text ?? "";
}

async function transcribeFile(
  fileBuffer: Buffer,
  originalName: string,
  language: string | undefined
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-"));

  try {
    // Save original file
    const inputPath = path.join(tmpDir, `input${ext || ".mp3"}`);
    await fs.writeFile(inputPath, fileBuffer);

    // Convert to compact mono MP3
    const compactPath = path.join(tmpDir, "compact.mp3");
    await toCompactMp3(inputPath, compactPath);

    const compactBuf = await fs.readFile(compactPath);

    // If small enough, transcribe in one shot
    if (compactBuf.length <= MAX_INLINE_BYTES) {
      return await transcribeBuffer(compactBuf, "audio/mp3", language);
    }

    // File is large — split into chunks and transcribe each
    const chunkDir = path.join(tmpDir, "chunks");
    await fs.mkdir(chunkDir);
    const chunks = await splitMp3(compactPath, chunkDir);

    const parts: string[] = [];
    for (const chunkPath of chunks) {
      const chunkBuf = await fs.readFile(chunkPath);
      const text = await transcribeBuffer(chunkBuf, "audio/mp3", language);
      if (text.trim()) parts.push(text.trim());
    }

    return parts.join(" ");
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Transcribe audio files (MP3, WAV, M4A, OGG, etc.)
router.post("/audio", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف صوتي" });
    return;
  }

  const language = (req.body as { language?: string }).language || undefined;

  try {
    const text = await transcribeFile(req.file.buffer, req.file.originalname || "audio.mp3", language);
    res.json({ text, language: language || null, duration: null });
  } catch (err: unknown) {
    req.log.error({ err }, "Error transcribing audio");
    res.status(400).json({ error: "فشل تحويل الصوت إلى نص. تأكد من صحة الملف." });
  }
});

// Transcribe video files (MP4, MKV, AVI, etc.) — extracts audio first via ffmpeg
router.post("/video", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف فيديو" });
    return;
  }

  const language = (req.body as { language?: string }).language || undefined;

  try {
    const text = await transcribeFile(req.file.buffer, req.file.originalname || "video.mp4", language);
    res.json({ text, language: language || null, duration: null });
  } catch (err: unknown) {
    req.log.error({ err }, "Error transcribing video");
    res.status(400).json({ error: "فشل تحويل الفيديو إلى نص. تأكد من صحة الملف." });
  }
});

export default router;
