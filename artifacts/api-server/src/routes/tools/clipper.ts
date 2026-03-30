import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { validatePublicUrlWithDns } from "../../lib/url-validation";
import { runYtDlp } from "../../lib/ytdlp";
import { getVideoInfoInvidious } from "../../lib/invidious";

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

function isYtDlpBotError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Sign in to confirm") ||
    msg.includes("bot") ||
    msg.includes("cookies") ||
    msg.includes("Login required") ||
    msg.includes("HTTP Error 429") ||
    msg.includes("HTTP Error 403")
  );
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

  // ── Try yt-dlp first ────────────────────────────────────────────────────────
  try {
    const output = await runYtDlp([
      "--dump-json", "--no-playlist", "--no-warnings", url,
    ]);

    const info = JSON.parse(output.trim()) as YtDlpInfo;

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
    req.log.warn({ err: ytErr }, "yt-dlp failed for /info, trying Invidious fallback");
    if (!isYtDlpBotError(ytErr)) {
      // Not a bot error — don't bother with Invidious
      res.status(400).json({ error: "تعذر الحصول على معلومات الفيديو." });
      return;
    }
  }

  // ── Invidious fallback ──────────────────────────────────────────────────────
  try {
    const info = await getVideoInfoInvidious(url);

    const formats = info.videoFormats
      .map((f, i) => ({
        format_id: `inv:${f.qualityLabel ?? i}`,
        ext: f.container ?? "mp4",
        resolution: f.qualityLabel ?? "فيديو",
        filesize: null,
        vcodec: f.encoding ?? null,
        acodec: null,
        note: null,
        protocol: "https",
      }))
      .filter(
        (f, i, arr) =>
          arr.findIndex((x) => x.resolution === f.resolution) === i
      );

    formats.sort((a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0));

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration || null,
      uploader: info.uploader,
      formats,
      _source: "invidious",
    });
  } catch (invErr: unknown) {
    req.log.error({ err: invErr }, "Invidious fallback also failed for /info");
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

  const isInvidiousFormat = typeof format_id === "string" && format_id.startsWith("inv:");
  let ytDlpError: unknown = null;

  // ── Try yt-dlp (unless format is Invidious-sourced) ────────────────────────
  if (!isInvidiousFormat) {
    try {
      await clipWithYtDlp({ url, start_time, end_time, format_id, type, startSec, endSec, duration, tmpDir, runFfmpeg, findFile });
      const outputPath = await findClipOutput(tmpDir, type);
      if (outputPath) {
        streamClip(res, req, outputPath, tmpDir, start_time, end_time, type);
        return;
      }
    } catch (err: unknown) {
      ytDlpError = err;
      req.log.warn({ err }, "yt-dlp clip failed, trying Invidious fallback");
      if (!isYtDlpBotError(err)) {
        req.log.error({ err }, "Non-bot yt-dlp error — not falling back to Invidious");
        if (!res.headersSent) {
          res.status(400).json({ error: "فشل قص الفيديو. تأكد من صحة البيانات." });
        }
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        return;
      }
    }
  }

  // ── Invidious fallback ──────────────────────────────────────────────────────
  try {
    const invInfo = await getVideoInfoInvidious(url);

    // Pick quality: match format_id label or use best
    const wantedQuality = typeof format_id === "string"
      ? format_id.replace("inv:", "")
      : null;

    // Find matching video format
    let chosenVideo = wantedQuality
      ? invInfo.videoFormats.find((f) => f.qualityLabel === wantedQuality)
      : null;
    if (!chosenVideo) chosenVideo = invInfo.videoFormats[0] ?? null;

    const audioUrl = invInfo.audioUrl;

    if (type === "audio" || type === "mp3") {
      if (!audioUrl) throw new Error("لا يوجد صوت متاح من Invidious");
      const outputExt = type === "mp3" ? "mp3" : "m4a";
      const outputPath = path.join(tmpDir, `clip.${outputExt}`);
      const contentType = type === "mp3" ? "audio/mpeg" : "audio/mp4";

      await runFfmpeg([
        "-ss", String(startSec), "-t", String(duration),
        "-i", audioUrl,
        "-vn",
        ...(type === "mp3"
          ? ["-ar", "44100", "-ac", "2", "-b:a", "192k"]
          : ["-c:a", "aac", "-b:a", "192k"]),
        "-y", outputPath,
      ]);

      const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}.${outputExt}`;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.sendFile(outputPath, (sendErr) => {
        if (sendErr && !res.headersSent) res.status(500).end();
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
      return;
    }

    // Video clip via Invidious stream URLs + ffmpeg
    if (!chosenVideo) throw new Error("لا تتوفر تنسيقات فيديو من Invidious");
    const outputPath = path.join(tmpDir, "clip.mp4");

    const ffArgs = audioUrl
      ? [
          "-ss", String(startSec), "-t", String(duration),
          "-i", chosenVideo.url,
          "-ss", String(startSec), "-t", String(duration),
          "-i", audioUrl,
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "copy", "-c:a", "aac",
          "-shortest", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
          "-y", outputPath,
        ]
      : [
          "-ss", String(startSec), "-t", String(duration),
          "-i", chosenVideo.url,
          "-c:v", "copy",
          "-y", outputPath,
        ];

    await runFfmpeg(ffArgs);

    const filename = `clip_${start_time.replace(/:/g, "-")}_${end_time.replace(/:/g, "-")}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(outputPath, (sendErr) => {
      if (sendErr && !res.headersSent) res.status(500).end();
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (invErr: unknown) {
    req.log.error({ ytDlpError, invErr }, "Both yt-dlp and Invidious failed for /clip");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل قص الفيديو. تأكد من صحة البيانات والرابط." });
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function clipWithYtDlp(opts: {
  url: string; start_time: string; end_time: string;
  format_id?: string | null; type?: string;
  startSec: number; endSec: number; duration: number;
  tmpDir: string;
  runFfmpeg: (args: string[]) => Promise<void>;
  findFile: (dir: string, prefix: string) => Promise<string | null>;
}): Promise<void> {
  const { url, start_time, end_time, format_id, type, startSec, duration, tmpDir, runFfmpeg, findFile } = opts;
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
    return;
  }

  const videoFormat =
    format_id && format_id !== "best"
      ? `${format_id}/bestvideo[ext=mp4]/bestvideo`
      : "bestvideo[ext=mp4]/bestvideo";

  await runYtDlp([
    "--no-playlist", "--no-warnings",
    "--downloader", "native",
    "--download-sections", sectionSpec,
    "-f", videoFormat,
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
}

async function findClipOutput(tmpDir: string, type?: string): Promise<string | null> {
  if (type === "mp3") return findFile(tmpDir, "clip.mp3").catch(() => null).then(f => f ?? findFile(tmpDir, "clip").catch(() => null));
  return findFile(tmpDir, "clip");
}

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
    ext === "m4a" ? "audio/mp4" :
    "video/mp4";
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
