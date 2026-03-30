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
    res.status(400).json({ error: "URL مطلوب" });
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
      return (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0);
    });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || null,
      formats,
    });
    return;
  } catch (ytErr: unknown) {
    req.log.warn({ err: ytErr }, "yt-dlp /info failed, trying Invidious");
    if (!isYtDlpBotError(ytErr)) {
      res.status(400).json({ error: "تعذر الحصول على معلومات الفيديو. تأكد من صحة الرابط." });
      return;
    }
  }

  // ── Invidious fallback ──────────────────────────────────────────────────────
  try {
    const info = await getVideoInfoInvidious(url);

    const formats = [
      ...info.videoFormats.map((f, i) => ({
        format_id: `inv:${f.qualityLabel ?? i}`,
        ext: f.container ?? "mp4",
        resolution: f.qualityLabel ?? "فيديو",
        filesize: null as number | null,
        vcodec: f.encoding ?? null,
        acodec: null as string | null,
        note: null as string | null,
      })),
      ...(info.audioUrl ? [{
        format_id: "inv:audio",
        ext: "mp3",
        resolution: "صوت فقط",
        filesize: null as number | null,
        vcodec: null as string | null,
        acodec: "aac",
        note: null as string | null,
      }] : []),
    ].filter(
      (f, i, arr) => arr.findIndex((x) => x.resolution === f.resolution) === i
    );

    formats.sort((a, b) => {
      const aIsVideo = a.vcodec !== null;
      const bIsVideo = b.vcodec !== null;
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;
      return (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0);
    });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration || null,
      uploader: info.uploader,
      formats,
    });
  } catch (invErr: unknown) {
    req.log.error({ err: invErr }, "Invidious fallback also failed for /info");
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
  const isInvidiousFormat = typeof format_id === "string" && format_id.startsWith("inv:");

  // ── Try yt-dlp (unless format is Invidious-sourced) ────────────────────────
  if (!isInvidiousFormat) {
    try {
      const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");
      const args: string[] = ["--no-playlist", "--no-warnings", "-o", outputTemplate];

      if (type === "audio") {
        args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
      } else if (format_id) {
        args.push(
          "-f", `${format_id}+bestaudio[ext=m4a]/${format_id}+bestaudio/${format_id}/best`,
          "--merge-output-format", "mp4"
        );
      } else {
        args.push(
          "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
          "--merge-output-format", "mp4"
        );
      }
      args.push(url);

      await runYtDlp(args);

      const files = await fs.readdir(tmpDir);
      if (files.length === 0) throw new Error("لم يتم تنزيل أي ملف");

      const filePath = path.join(tmpDir, files[0]);
      const ext = path.extname(files[0]).toLowerCase();
      const contentType =
        type === "audio" || ext === ".mp3" ? "audio/mpeg" :
        ext === ".mp4" ? "video/mp4" : "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(files[0])}`);
      res.sendFile(filePath, (sendErr) => {
        if (sendErr && !res.headersSent) res.status(500).end();
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
      return;
    } catch (ytErr: unknown) {
      req.log.warn({ err: ytErr }, "yt-dlp download failed, trying Invidious");
      if (!isYtDlpBotError(ytErr)) {
        if (!res.headersSent) res.status(400).json({ error: "فشل التنزيل. تأكد من صحة الرابط." });
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        return;
      }
    }
  }

  // ── Invidious fallback ──────────────────────────────────────────────────────
  try {
    const invInfo = await getVideoInfoInvidious(url);
    const wantedQuality = typeof format_id === "string"
      ? format_id.replace("inv:", "")
      : null;

    if (type === "audio" || wantedQuality === "audio") {
      if (!invInfo.audioUrl) throw new Error("لا يوجد صوت متاح");
      const outputPath = path.join(tmpDir, "audio.mp3");
      await runFfmpeg([
        "-i", invInfo.audioUrl,
        "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
        "-y", outputPath,
      ]);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(invInfo.title)}.mp3"`);
      res.sendFile(outputPath, (sendErr) => {
        if (sendErr && !res.headersSent) res.status(500).end();
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
      return;
    }

    // Video download
    let chosenVideo = wantedQuality
      ? invInfo.videoFormats.find((f) => f.qualityLabel === wantedQuality)
      : null;
    if (!chosenVideo) chosenVideo = invInfo.videoFormats[0] ?? null;
    if (!chosenVideo) throw new Error("لا تتوفر تنسيقات فيديو");

    const outputPath = path.join(tmpDir, "video.mp4");
    const ffArgs = invInfo.audioUrl
      ? [
          "-i", chosenVideo.url, "-i", invInfo.audioUrl,
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "copy", "-c:a", "aac",
          "-movflags", "+faststart", "-y", outputPath,
        ]
      : ["-i", chosenVideo.url, "-c:v", "copy", "-y", outputPath];

    await runFfmpeg(ffArgs);

    const filename = `${invInfo.title}_${chosenVideo.qualityLabel ?? "video"}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(outputPath, (sendErr) => {
      if (sendErr && !res.headersSent) res.status(500).end();
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (invErr: unknown) {
    req.log.error({ err: invErr }, "Invidious fallback also failed for /download");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل التنزيل. تأكد من صحة الرابط والإعدادات." });
    }
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
