import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { validatePublicUrlWithDns } from "../../lib/url-validation";

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
  protocol?: string;
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

// Find a file in directory by prefix
async function findFile(dir: string, prefix: string): Promise<string | null> {
  const files = await fs.readdir(dir);
  const found = files.find((f) => f.startsWith(prefix + "."));
  return found ? path.join(dir, found) : null;
}

// Get YouTube video info
router.post("/info", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "رابط يوتيوب مطلوب" });
    return;
  }

  const urlCheck = await validatePublicUrlWithDns(url);
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

    // Show all video-bearing formats (including HLS) — we handle them properly in /clip
    const formats = (info.formats || [])
      .filter((f) => f.vcodec && f.vcodec !== "none")
      .map((f) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || (f.height ? `${f.height}p` : "فيديو"),
        filesize: f.filesize ?? f.filesize_approx ?? null,
        vcodec: f.vcodec && f.vcodec !== "none" ? f.vcodec : null,
        acodec: f.acodec && f.acodec !== "none" ? f.acodec : null,
        note: f.format_note ?? null,
        protocol: f.protocol ?? null,
      }))
      .filter(
        (f, i, arr) =>
          arr.findIndex((x) => x.resolution === f.resolution && x.ext === f.ext) === i
      );

    formats.sort((a, b) => {
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
// Strategy: download video-section and audio separately via yt-dlp native HLS downloader,
// then combine locally with ffmpeg (avoids ffmpeg's broken HLS audio mux bug).
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

  const urlCheck = await validatePublicUrlWithDns(url);
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
  const duration = endSec - startSec;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));

  try {
    const sectionSpec = `*${start_time}-${end_time}`;

    if (type === "audio" || type === "mp3") {
      // ── Audio-only path ──────────────────────────────────────────────────
      // Download full audio using native downloader (avoids ffmpeg HLS issues)
      await runYtDlp([
        "--no-playlist", "--no-warnings",
        "--downloader", "native",
        "-f", "bestaudio",
        "-o", path.join(tmpDir, "audio.%(ext)s"),
        url,
      ]);

      const audioSrc = await findFile(tmpDir, "audio");
      if (!audioSrc) throw new Error("فشل تنزيل الصوت");

      const outputExt = type === "mp3" ? "mp3" : "m4a";
      const outputPath = path.join(tmpDir, `clip.${outputExt}`);
      const contentType = type === "mp3" ? "audio/mpeg" : "audio/mp4";

      if (type === "mp3") {
        await runFfmpeg([
          "-ss", String(startSec), "-t", String(duration),
          "-i", audioSrc,
          "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
          "-y", outputPath,
        ]);
      } else {
        await runFfmpeg([
          "-ss", String(startSec), "-t", String(duration),
          "-i", audioSrc,
          "-vn", "-c:a", "aac", "-b:a", "192k",
          "-y", outputPath,
        ]);
      }

      const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}.${outputExt}`;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.sendFile(outputPath, (sendErr) => {
        if (sendErr && !res.headersSent) {
          req.log.error({ err: sendErr }, "Error streaming clip");
          res.status(500).end();
        }
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
      return;
    }

    // ── Video path ────────────────────────────────────────────────────────
    // Two-step: download video section + full audio separately (native HLS downloader),
    // then combine locally with ffmpeg.

    // Pick video-only format
    const videoFormat =
      format_id && format_id !== "best"
        ? `${format_id}/bestvideo[ext=mp4]/bestvideo`
        : "bestvideo[ext=mp4]/bestvideo";

    // Step 1: video section (native handles HLS sections cleanly)
    await runYtDlp([
      "--no-playlist", "--no-warnings",
      "--downloader", "native",
      "--download-sections", sectionSpec,
      "-f", videoFormat,
      "-o", path.join(tmpDir, "video.%(ext)s"),
      url,
    ]);

    // Step 2: full audio (native downloads full stream; we cut with ffmpeg locally)
    await runYtDlp([
      "--no-playlist", "--no-warnings",
      "--downloader", "native",
      "-f", "bestaudio",
      "-o", path.join(tmpDir, "audio.%(ext)s"),
      url,
    ]);

    const videoSrc = await findFile(tmpDir, "video");
    const audioSrc = await findFile(tmpDir, "audio");
    if (!videoSrc || !audioSrc) throw new Error("فشل تنزيل الفيديو أو الصوت");

    const outputPath = path.join(tmpDir, "clip.mp4");

    // Step 3: combine locally — video is already trimmed, cut audio to match
    await runFfmpeg([
      "-i", videoSrc,
      "-ss", String(startSec), "-t", String(duration), "-i", audioSrc,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart",
      "-y", outputPath,
    ]);

    const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(outputPath, (sendErr) => {
      if (sendErr && !res.headersSent) {
        req.log.error({ err: sendErr }, "Error streaming clip");
        res.status(500).end();
      }
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Error clipping video");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل قص الفيديو. تأكد من صحة البيانات." });
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
