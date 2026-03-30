import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

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

interface NormalizedFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  vcodec: string | null;
  acodec: string | null;
  note: string | null;
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

// Get video info and available formats
router.post("/info", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "URL مطلوب" });
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

    const formats: NormalizedFormat[] = (info.formats || [])
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
    req.log.error({ err }, "Error getting video info");
    res.status(400).json({ error: "تعذر الحصول على معلومات الفيديو. تأكد من صحة الرابط." });
  }
});

// Download video or audio
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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdl-"));
  const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  try {
    const args: string[] = [
      "--no-playlist",
      "--no-warnings",
      "-o", outputTemplate,
    ];

    if (type === "audio") {
      args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    } else if (format_id) {
      args.push("-f", `${format_id}+bestaudio[ext=m4a]/${format_id}/best`);
    } else {
      args.push("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
    }

    args.push(url);

    await runYtDlp(args);

    const files = await fs.readdir(tmpDir);
    if (files.length === 0) throw new Error("لم يتم تنزيل أي ملف");

    const filePath = path.join(tmpDir, files[0]);
    const ext = path.extname(files[0]).toLowerCase();
    const contentType = type === "audio" || ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".mp4"
      ? "video/mp4"
      : "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(files[0])}`
    );

    const fileBuffer = await fs.readFile(filePath);
    res.send(fileBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "Error downloading media");
    if (!res.headersSent) {
      res.status(400).json({ error: "فشل التنزيل. تأكد من صحة الرابط والإعدادات." });
    }
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
