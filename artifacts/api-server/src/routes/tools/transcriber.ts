import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"]);

function extractAudioFromVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", inputPath,
      "-vn",
      "-ar", "16000",
      "-ac", "1",
      "-f", "mp3",
      "-y", outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
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
    let audioPath: string;

    if (isVideo) {
      const videoPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(videoPath, fileBuffer);
      audioPath = path.join(tmpDir, "audio.mp3");
      await extractAudioFromVideo(videoPath, audioPath);
    } else {
      audioPath = path.join(tmpDir, `audio${ext || ".mp3"}`);
      await fs.writeFile(audioPath, fileBuffer);
    }

    const rawBuffer = await fs.readFile(audioPath);
    const audioBuffer = new Uint8Array(rawBuffer);
    const audioFile = new File([audioBuffer], `audio${path.extname(audioPath) || ".mp3"}`, {
      type: "audio/mpeg",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      ...(language ? { language } : {}),
    });

    return transcription.text;
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
