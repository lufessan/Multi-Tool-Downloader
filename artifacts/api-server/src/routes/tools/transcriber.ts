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
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

router.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف صوتي أو فيديو" });
    return;
  }

  const originalName = req.file.originalname || "upload";
  const ext = path.extname(originalName).toLowerCase();
  const language = (req.body as { language?: string }).language || undefined;

  const videoExts = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"];
  const isVideo = videoExts.includes(ext);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-"));

  try {
    let audioPath: string;

    if (isVideo) {
      const videoPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(videoPath, req.file.buffer);
      audioPath = path.join(tmpDir, "audio.mp3");
      await extractAudioFromVideo(videoPath, audioPath);
    } else {
      audioPath = path.join(tmpDir, `audio${ext || ".mp3"}`);
      await fs.writeFile(audioPath, req.file.buffer);
    }

    const audioBuffer = await fs.readFile(audioPath);
    const audioFile = new File([audioBuffer], `audio${ext || ".mp3"}`, {
      type: "audio/mpeg",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      ...(language ? { language } : {}),
    });

    res.json({
      text: transcription.text,
      language: language || null,
      duration: null,
    });
  } catch (err: any) {
    req.log.error({ err }, "Error transcribing media");
    res.status(400).json({ error: "فشل تحويل الصوت إلى نص. تأكد من صحة الملف." });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
