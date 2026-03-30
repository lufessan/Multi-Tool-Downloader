import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { validatePublicUrlWithDns } from "../../lib/url-validation";
import { runYtDlp } from "../../lib/ytdlp";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
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

// ── File upload route ─────────────────────────────────────────────────────────

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

    const filename = `${baseName}.mp3`;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(outputPath, (sendErr) => {
      if (sendErr && !res.headersSent) {
        req.log.error({ err: sendErr }, "Error streaming MP3");
        res.status(500).end();
      }
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Error converting to MP3");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل تحويل الملف إلى MP3. تأكد من صحة الملف." });
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── URL-based route ───────────────────────────────────────────────────────────

router.post("/to-mp3-from-url", async (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url) {
    res.status(400).json({ error: "يرجى إدخال رابط الفيديو أو الصوت" });
    return;
  }

  const urlCheck = await validatePublicUrlWithDns(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error || "رابط غير صالح" });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "convert-url-"));

  try {
    // Download best audio with native downloader
    await runYtDlp([
      "--no-playlist", "--no-warnings",
      "--downloader", "native",
      "-f", "bestaudio/best",
      "-o", path.join(tmpDir, "downloaded.%(ext)s"),
      url,
    ]);

    const files = await fs.readdir(tmpDir);
    const downloaded = files.find((f) => f.startsWith("downloaded."));
    if (!downloaded) throw new Error("فشل تنزيل الملف من الرابط");

    const downloadedPath = path.join(tmpDir, downloaded);
    const outputPath = path.join(tmpDir, "output.mp3");

    await convertToMp3(downloadedPath, outputPath);

    // Use video title if available, else generic name
    let title = "audio";
    try {
      const info = await runYtDlp(["--get-title", "--no-warnings", url]);
      title = info.trim().replace(/[/\\?%*:|"<>]/g, "-").substring(0, 80) || "audio";
    } catch { /* ignore */ }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(title + ".mp3")}`);
    res.sendFile(outputPath, (sendErr) => {
      if (sendErr && !res.headersSent) {
        req.log.error({ err: sendErr }, "Error streaming MP3 from URL");
        res.status(500).end();
      }
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Error converting URL to MP3");
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("فشل تنزيل")) {
        res.status(400).json({ error: "تعذر تنزيل الملف. تأكد أن الرابط صحيح وأن الموقع مدعوم." });
      } else {
        res.status(400).json({ error: "فشل تحويل الرابط إلى MP3. حاول مرة أخرى." });
      }
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
