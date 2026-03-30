import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", inputPath,
      "-vn",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "192k",
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

router.post("/to-mp3", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "يرجى رفع ملف فيديو" });
    return;
  }

  const originalName = req.file.originalname || "video.mp4";
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "convert-"));

  try {
    const inputPath = path.join(tmpDir, `input${ext || ".mp4"}`);
    const outputPath = path.join(tmpDir, "output.mp3");

    await fs.writeFile(inputPath, req.file.buffer);
    await convertToMp3(inputPath, outputPath);

    const mp3Buffer = await fs.readFile(outputPath);
    const filename = `${baseName}.mp3`;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(mp3Buffer);
  } catch (err: any) {
    req.log.error({ err }, "Error converting to MP3");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل تحويل الملف إلى MP3. تأكد من صحة الملف." });
    }
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
