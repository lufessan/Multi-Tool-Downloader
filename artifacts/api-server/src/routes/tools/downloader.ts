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
  { format_id: "best",  ext: "mp4", resolution: "أفضل جودة",  filesize: null, vcodec: "avc1", acodec: "aac", note: null },
  { format_id: "1080p", ext: "mp4", resolution: "1080p", filesize: null, vcodec: "avc1", acodec: "aac", note: "Full HD" },
  { format_id: "720p",  ext: "mp4", resolution: "720p",  filesize: null, vcodec: "avc1", acodec: "aac", note: "HD" },
  { format_id: "480p",  ext: "mp4", resolution: "480p",  filesize: null, vcodec: "avc1", acodec: "aac", note: null },
  { format_id: "360p",  ext: "mp4", resolution: "360p",  filesize: null, vcodec: "avc1", acodec: "aac", note: null },
  { format_id: "audio", ext: "mp3", resolution: "صوت فقط", filesize: null, vcodec: null, acodec: "mp3", note: null },
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
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
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


// ── GET VIDEO INFO ─────────────────────────────────────────────────────────────
router.post("/info", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "URL مطلوب" });
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
        filesize?: number; filesize_approx?: number; vcodec?: string; acodec?: string; format_note?: string; }>;
    };

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
      .filter((f, i, arr) => arr.findIndex((x) => x.resolution === f.resolution && x.ext === f.ext) === i);

    formats.sort((a, b) => {
      const aIsVideo = a.vcodec !== null;
      const bIsVideo = b.vcodec !== null;
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;
      return (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0);
    });

    res.json({ title: info.title, thumbnail: info.thumbnail || null, duration: info.duration || null,
      uploader: info.uploader || null, formats });
    return;
  } catch (ytErr: unknown) {
    req.log.warn({ err: ytErr }, "yt-dlp /info failed, falling back to oEmbed");
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

// ── DOWNLOAD VIDEO/AUDIO ───────────────────────────────────────────────────────
router.post("/download", async (req, res) => {
  const { url, format_id, type } = req.body as {
    url?: string;
    format_id?: string | null;
    type?: "video" | "audio";
  };

  if (!url) {
    res.status(400).json({ error: "URL مطلوب" });
    return;
  }

  const urlCheck = await validatePublicUrlWithDns(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error || "رابط غير صالح" });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdl-"));

  try {
    const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");
    const args: string[] = ["--no-playlist", "--no-warnings", "-o", outputTemplate];

    const qualityMap: Record<string, string> = {
      "best":  "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
      "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best",
      "720p":  "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best",
      "480p":  "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best",
      "360p":  "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best",
    };

    if (type === "audio" || format_id === "audio") {
      args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    } else {
      const fmt = format_id && qualityMap[format_id]
        ? qualityMap[format_id]
        : (format_id ? `${format_id}+bestaudio[ext=m4a]/${format_id}+bestaudio/${format_id}/best` : qualityMap["best"]);
      args.push("-f", fmt, "--merge-output-format", "mp4");
    }
    args.push(url);

    await runYtDlp(args);

    const files = await fs.readdir(tmpDir);
    if (files.length === 0) throw new Error("لم يتم تنزيل أي ملف");

    const filePath = path.join(tmpDir, files[0]);
    const ext = path.extname(files[0]).toLowerCase();
    const contentType =
      type === "audio" || format_id === "audio" || ext === ".mp3" ? "audio/mpeg" :
      ext === ".mp4" ? "video/mp4" : "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(files[0])}`);
    res.sendFile(filePath, (sendErr) => {
      if (sendErr && !res.headersSent) res.status(500).end();
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (ytErr: unknown) {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) {
      const isBotErr = isYtDlpBotError(ytErr);
      const isGeoErr = !isBotErr && isYtDlpGeoError(ytErr);
      res.status(400).json({
        error: isBotErr ? BOT_ERROR_MESSAGE : isGeoErr ? GEO_ERROR_MESSAGE : "فشل التنزيل. تأكد من صحة الرابط.",
        cookies_required: isBotErr,
        geo_blocked: isGeoErr,
      });
    }
  }
});

export default router;
