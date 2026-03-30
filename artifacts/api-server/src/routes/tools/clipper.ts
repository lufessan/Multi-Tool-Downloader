import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { validatePublicUrl } from "../../lib/url-validation";

const router: IRouter = Router();

interface YtDlpFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
  format_note?: string;
}

interface YtDlpInfo {
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  formats?: YtDlpFormat[];
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d));
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

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

// Convert time string HH:MM:SS or MM:SS to seconds
function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Get YouTube video info
router.post("/info", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "رابط يوتيوب مطلوب" });
    return;
  }

  const urlCheck = validatePublicUrl(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error || "رابط غير صالح" });
    return;
  }

  try {
    const output = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ]);

    const info = JSON.parse(output.trim()) as YtDlpInfo;

    const formats = (info.formats || [])
      .filter((f) => f.vcodec !== "none" || f.acodec !== "none")
      .map((f) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || (f.height ? `${f.height}p` : "صوت فقط"),
        filesize: f.filesize ?? f.filesize_approx ?? null,
        vcodec: f.vcodec && f.vcodec !== "none" ? f.vcodec : null,
        acodec: f.acodec && f.acodec !== "none" ? f.acodec : null,
        note: f.format_note ?? null,
      }))
      .filter(
        (f, i, arr) =>
          arr.findIndex((x) => x.resolution === f.resolution && x.ext === f.ext) === i
      );

    formats.sort((a, b) => {
      const aIsVideo = a.vcodec !== null;
      const bIsVideo = b.vcodec !== null;
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;
      const aH = parseInt(a.resolution) || 0;
      const bH = parseInt(b.resolution) || 0;
      return bH - aH;
    });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || null,
      formats,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Error getting YouTube info");
    res.status(400).json({ error: "تعذر الحصول على معلومات الفيديو." });
  }
});

// Clip a section from a YouTube video
router.post("/clip", async (req, res) => {
  const { url, start_time, end_time, format_id, type } = req.body as {
    url?: string;
    start_time?: string;
    end_time?: string;
    format_id?: string | null;
    type?: "video" | "audio" | "mp3";
  };

  if (!url || !start_time || !end_time) {
    res.status(400).json({ error: "الرابط ووقت البداية والنهاية مطلوبة" });
    return;
  }

  const urlCheck = validatePublicUrl(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error || "رابط غير صالح" });
    return;
  }

  const startSec = timeToSeconds(start_time);
  const endSec = timeToSeconds(end_time);
  if (endSec <= startSec) {
    res.status(400).json({ error: "وقت النهاية يجب أن يكون بعد وقت البداية" });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));

  try {
    const downloadedFile = path.join(tmpDir, "source.%(ext)s");
    const sectionSpec = `*${start_time}-${end_time}`;

    const dlArgs: string[] = [
      "--no-playlist",
      "--no-warnings",
      "--download-sections", sectionSpec,
      "-o", downloadedFile,
    ];

    if (type === "audio" || type === "mp3") {
      dlArgs.push("-f", "bestaudio");
    } else if (format_id) {
      dlArgs.push("-f", `${format_id}+bestaudio[ext=m4a]/${format_id}/best`);
    } else {
      dlArgs.push("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
    }

    dlArgs.push(url);
    await runYtDlp(dlArgs);

    const downloadedFiles = await fs.readdir(tmpDir);
    if (downloadedFiles.length === 0) throw new Error("فشل تنزيل الفيديو");

    const sourcePath = path.join(tmpDir, downloadedFiles[0]);
    let outputPath: string;
    let contentType: string;

    if (type === "mp3") {
      outputPath = path.join(tmpDir, "clip.mp3");
      contentType = "audio/mpeg";
      await runFfmpeg([
        "-i", sourcePath,
        "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
        "-y", outputPath,
      ]);
    } else if (type === "audio") {
      outputPath = path.join(tmpDir, "clip.m4a");
      contentType = "audio/mp4";
      await runFfmpeg([
        "-i", sourcePath,
        "-vn", "-c:a", "aac", "-b:a", "192k",
        "-y", outputPath,
      ]);
    } else {
      outputPath = path.join(tmpDir, "clip.mp4");
      contentType = "video/mp4";
      await runFfmpeg([
        "-i", sourcePath,
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-y", outputPath,
      ]);
    }

    const ext = path.extname(outputPath);
    const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}${ext}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const fileBuffer = await fs.readFile(outputPath);
    res.send(fileBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "Error clipping video");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل قص الفيديو. تأكد من صحة البيانات." });
    }
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
