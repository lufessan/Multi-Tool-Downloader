import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { toFile } from "groq-sdk";
import { groq, TRANSCRIPTION_MODEL, isGroqAvailable } from "../../lib/groq-client";
import { validatePublicUrlWithDns } from "../../lib/url-validation";
import { runYtDlp } from "../../lib/ytdlp";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"]);

// Groq Whisper: max 25MB per request
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

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


function toCompactMp3(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    "-i", inputPath,
    "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
    "-f", "mp3", "-y", outputPath,
  ]);
}

async function splitMp3(inputPath: string, chunkDir: string): Promise<string[]> {
  await runFfmpeg([
    "-i", inputPath,
    "-f", "segment",
    "-segment_time", "300",
    "-c", "copy",
    path.join(chunkDir, "chunk_%03d.mp3"),
  ]);
  const files = await fs.readdir(chunkDir);
  return files
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(chunkDir, f));
}

async function transcribeBuffer(audioBuffer: Buffer, filename: string, language?: string): Promise<string> {
  const file = await toFile(audioBuffer, filename, { type: "audio/mp3" });
  const result = await groq.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
    response_format: "json",
    ...(language && language !== "auto" ? { language } : {}),
  });
  return result.text;
}

async function transcribeFile(
  fileBuffer: Buffer,
  originalName: string,
  language: string | undefined
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);
  void isVideo;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-"));

  try {
    const inputPath = path.join(tmpDir, `input${ext || ".mp3"}`);
    await fs.writeFile(inputPath, fileBuffer);

    const compactPath = path.join(tmpDir, "compact.mp3");
    await toCompactMp3(inputPath, compactPath);

    const compactBuf = await fs.readFile(compactPath);

    if (compactBuf.length <= MAX_AUDIO_BYTES) {
      return await transcribeBuffer(compactBuf, "audio.mp3", language);
    }

    const chunkDir = path.join(tmpDir, "chunks");
    await fs.mkdir(chunkDir);
    const chunks = await splitMp3(compactPath, chunkDir);

    const parts: string[] = [];
    for (const chunkPath of chunks) {
      const chunkBuf = await fs.readFile(chunkPath);
      if (chunkBuf.length > 100) {
        const text = await transcribeBuffer(chunkBuf, path.basename(chunkPath), language);
        if (text.trim()) parts.push(text.trim());
      }
    }

    return parts.join(" ");
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Download audio from any URL using yt-dlp, returns path to audio file in tmpDir
async function downloadAudioFromUrl(url: string, tmpDir: string): Promise<string> {
  await runYtDlp([
    "--no-playlist", "--no-warnings",
    "--downloader", "native",
    "-f", "bestaudio/best",
    "-o", path.join(tmpDir, "downloaded.%(ext)s"),
    url,
  ]);
  const files = await fs.readdir(tmpDir);
  const found = files.find((f) => f.startsWith("downloaded."));
  if (!found) throw new Error("فشل تنزيل الملف من الرابط");
  return path.join(tmpDir, found);
}

// ── File upload routes ────────────────────────────────────────────────────────

router.post("/audio", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف صوتي" });
    return;
  }
  if (!isGroqAvailable()) {
    res.status(503).json({ error: "خدمة التفريغ غير مفعّلة. يرجى إضافة GROQ_API_KEY." });
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

router.post("/video", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف فيديو" });
    return;
  }
  if (!isGroqAvailable()) {
    res.status(503).json({ error: "خدمة التفريغ غير مفعّلة. يرجى إضافة GROQ_API_KEY." });
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

// ── URL-based routes ──────────────────────────────────────────────────────────

router.post("/from-url", async (req, res) => {
  const { url, language } = req.body as { url?: string; language?: string };

  if (!url) {
    res.status(400).json({ error: "يرجى إدخال رابط الفيديو أو الصوت" });
    return;
  }

  const urlCheck = await validatePublicUrlWithDns(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error || "رابط غير صالح" });
    return;
  }

  if (!isGroqAvailable()) {
    res.status(503).json({ error: "خدمة التفريغ غير مفعّلة. يرجى إضافة GROQ_API_KEY." });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-url-"));
  try {
    const audioPath = await downloadAudioFromUrl(url, tmpDir);
    const audioBuffer = await fs.readFile(audioPath);
    const text = await transcribeFile(audioBuffer, path.basename(audioPath), language || undefined);
    res.json({ text, language: language || null, duration: null });
  } catch (err: unknown) {
    req.log.error({ err }, "Error transcribing from URL");
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("فشل تنزيل")) {
      res.status(400).json({ error: "تعذر تنزيل الملف. تأكد أن الرابط صحيح وأن الموقع مدعوم." });
    } else {
      res.status(400).json({ error: "فشل تفريغ الصوت من الرابط. حاول مرة أخرى." });
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return;
  }
  fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

export default router;
