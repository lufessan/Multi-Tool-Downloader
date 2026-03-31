import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import https from "https";
import os from "os";
import { validatePublicUrlWithDns } from "../../lib/url-validation";
import { runYtDlp, isYtDlpBotError, isYtDlpGeoError, BOT_ERROR_MESSAGE, GEO_ERROR_MESSAGE } from "../../lib/ytdlp";

const router: IRouter = Router();

const FIXED_FORMATS = [
  { format_id: "1080p", ext: "mp4", resolution: "1080p", filesize: null, vcodec: "avc1", acodec: "aac", note: "Full HD", protocol: "https" },
  { format_id: "720p",  ext: "mp4", resolution: "720p",  filesize: null, vcodec: "avc1", acodec: "aac", note: "HD",      protocol: "https" },
  { format_id: "480p",  ext: "mp4", resolution: "480p",  filesize: null, vcodec: "avc1", acodec: "aac", note: null,      protocol: "https" },
  { format_id: "360p",  ext: "mp4", resolution: "360p",  filesize: null, vcodec: "avc1", acodec: "aac", note: null,      protocol: "https" },
  { format_id: "audio", ext: "mp3", resolution: "صوت فقط", filesize: null, vcodec: null, acodec: "mp3", note: null,     protocol: "https" },
];

function fetchOEmbed(url: string): Promise<{ title: string; author_name: string; thumbnail_url: string }> {
  return new Promise((resolve, reject) => {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    https.get(endpoint, { timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", (d: Buffer) => (data += d));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("oEmbed parse error")); }
      });
    }).on("error", reject).on("timeout", () => reject(new Error("oEmbed timeout")));
  });
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
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

function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

async function findFile(dir: string, prefix: string): Promise<string | null> {
  const files = await fs.readdir(dir);
  const found = files.find((f) => f.startsWith(prefix + "."));
  return found ? path.join(dir, found) : null;
}


// ── GET VIDEO INFO ─────────────────────────────────────────────────────────────
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

  // ── Try yt-dlp first (works when cookies are set or on non-blocked IPs) ─────
  try {
    const output = await runYtDlp([
      "--dump-json", "--no-playlist", "--no-warnings", url,
    ]);

    const info = JSON.parse(output.trim()) as {
      title: string; thumbnail?: string; duration?: number; uploader?: string;
      formats?: Array<{ format_id: string; ext: string; resolution?: string; height?: number;
        filesize?: number; filesize_approx?: number; vcodec?: string; acodec?: string;
        format_note?: string; protocol?: string; }>;
    };

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
      .filter((f, i, arr) => arr.findIndex((x) => x.resolution === f.resolution && x.ext === f.ext) === i);

    formats.sort((a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0));

    res.json({
      title: info.title,
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || null,
      formats,
      _source: "ytdlp",
    });
    return;
  } catch (ytErr: unknown) {
    req.log.warn({ err: ytErr }, "yt-dlp failed for /info, falling back to oEmbed");
  }

  // ── oEmbed fallback (always works — no bot detection) ───────────────────────
  try {
    const oembed = await fetchOEmbed(url);
    const videoId = extractVideoId(url);
    const thumbnail = videoId
      ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
      : oembed.thumbnail_url;

    res.json({
      title: oembed.title,
      thumbnail,
      duration: null,
      uploader: oembed.author_name,
      formats: FIXED_FORMATS,
      _source: "oembed",
    });
  } catch (oembedErr: unknown) {
    req.log.error({ err: oembedErr }, "oEmbed also failed");
    res.status(400).json({ error: "تعذر الحصول على معلومات الفيديو. تأكد من صحة الرابط." });
  }
});

// ── CLIP VIDEO ─────────────────────────────────────────────────────────────────
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

      if (type === "mp3") {
        await runFfmpeg(["-ss", String(startSec), "-t", String(duration), "-i", audioSrc,
          "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", "-y", outputPath]);
      } else {
        await runFfmpeg(["-ss", String(startSec), "-t", String(duration), "-i", audioSrc,
          "-vn", "-c:a", "aac", "-b:a", "192k", "-y", outputPath]);
      }

      streamClip(res, req, outputPath, tmpDir, start_time, end_time, type);
      return;
    }

    // Resolve format
    const qualityMap: Record<string, string> = {
      "1080p": "bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]",
      "720p":  "bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]",
      "480p":  "bestvideo[height<=480][ext=mp4]/bestvideo[height<=480]",
      "360p":  "bestvideo[height<=360][ext=mp4]/bestvideo[height<=360]",
    };
    const videoFormatStr = (format_id && qualityMap[format_id])
      ? qualityMap[format_id]
      : (format_id && format_id !== "best" ? `${format_id}/bestvideo[ext=mp4]/bestvideo` : "bestvideo[ext=mp4]/bestvideo");

    await runYtDlp([
      "--no-playlist", "--no-warnings",
      "--downloader", "native",
      "--download-sections", sectionSpec,
      "-f", videoFormatStr,
      "-o", path.join(tmpDir, "video.%(ext)s"),
      url,
    ]);

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
    await runFfmpeg([
      "-i", videoSrc,
      "-ss", String(startSec), "-t", String(duration), "-i", audioSrc,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac",
      "-shortest", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
      "-y", outputPath,
    ]);

    streamClip(res, req, outputPath, tmpDir, start_time, end_time, type);
  } catch (err: unknown) {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) {
      const isBotErr = isYtDlpBotError(err);
      const isGeoErr = !isBotErr && isYtDlpGeoError(err);
      res.status(400).json({
        error: isBotErr ? BOT_ERROR_MESSAGE : isGeoErr ? GEO_ERROR_MESSAGE : "فشل قص الفيديو. تأكد من صحة البيانات.",
        cookies_required: isBotErr,
        geo_blocked: isGeoErr,
      });
    }
  }
});

function streamClip(
  res: import("express").Response,
  req: import("express").Request,
  outputPath: string,
  tmpDir: string,
  start_time: string,
  end_time: string,
  type?: string,
): void {
  const ext = path.extname(outputPath).slice(1) || "mp4";
  const contentType =
    ext === "mp3" ? "audio/mpeg" :
    ext === "m4a" ? "audio/mp4" : "video/mp4";
  const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}.${ext}`;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(outputPath, (sendErr) => {
    if (sendErr && !res.headersSent) {
      req.log.error({ err: sendErr }, "Error streaming clip");
      res.status(500).end();
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
}

export default router;
