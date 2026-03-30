import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import { toFile } from "groq-sdk";
import { groq, VISION_MODEL, TEXT_MODEL, TRANSCRIPTION_MODEL, isGroqAvailable } from "../../lib/groq-client";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

interface SourceLink {
  name: string;
  url: string;
  icon: string | null;
}

interface PodcastResult {
  title: string;
  description: string | null;
  image: string | null;
  author: string | null;
  categories: string[] | null;
  source_links: SourceLink[];
}

interface PodcastIndexFeed {
  title?: string;
  description?: string;
  image?: string;
  artwork?: string;
  author?: string;
  ownerName?: string;
  categories?: Record<string, string>;
  url?: string;
  link?: string;
}

interface PodcastIndexResponse { feeds?: PodcastIndexFeed[] }

interface ItunesPodcast {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  genres?: string[];
  feedUrl?: string;
}

interface ItunesResponse { results?: ItunesPodcast[] }

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited ${code}`));
    });
    proc.on("error", reject);
  });
}

function buildPodcastSourceLinks(title: string, feedUrl?: string): SourceLink[] {
  const encoded = encodeURIComponent(title);
  const links: SourceLink[] = [
    { name: "Apple Podcasts", url: `https://podcasts.apple.com/search?term=${encoded}`, icon: null },
    { name: "Spotify", url: `https://open.spotify.com/search/${encoded}/podcasts`, icon: null },
    { name: "Podchaser", url: `https://www.podchaser.com/search/podcasts/${encoded}`, icon: null },
  ];
  if (feedUrl) links.unshift({ name: "RSS Feed", url: feedUrl, icon: null });
  return links;
}

async function searchPodcastIndex(query: string): Promise<PodcastResult[]> {
  const apiKey = process.env["PODCAST_INDEX_API_KEY"];
  const apiSecret = process.env["PODCAST_INDEX_API_SECRET"];
  if (!apiKey || !apiSecret) return [];

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const authHash = crypto.createHash("sha1").update(apiKey + apiSecret + timestamp).digest("hex");

  const res = await fetch(
    `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(query)}&max=5`,
    { headers: { "X-Auth-Key": apiKey, "X-Auth-Date": timestamp, "Authorization": authHash, "User-Agent": "MediaToolsApp/1.0" } }
  );
  if (!res.ok) return [];

  const data = await res.json() as PodcastIndexResponse;
  return (data.feeds || []).map((f) => ({
    title: f.title || "غير معروف", description: f.description || null,
    image: f.artwork || f.image || null, author: f.author || f.ownerName || null,
    categories: f.categories ? Object.values(f.categories) : null,
    source_links: buildPodcastSourceLinks(f.title || query, f.url || f.link),
  }));
}

async function searchItunesPodcasts(query: string): Promise<PodcastResult[]> {
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=5`);
  const data = await res.json() as ItunesResponse;
  return (data.results || []).map((p) => ({
    title: p.trackName || p.collectionName || "غير معروف",
    description: null, image: p.artworkUrl600 || p.artworkUrl100 || null,
    author: p.artistName || null, categories: p.genres || null,
    source_links: buildPodcastSourceLinks(p.trackName || p.collectionName || query, p.feedUrl),
  }));
}

async function searchPodcasts(query: string): Promise<PodcastResult[]> {
  try {
    const idx = await searchPodcastIndex(query);
    if (idx.length > 0) return idx;
    return await searchItunesPodcasts(query);
  } catch { return []; }
}

async function extractFromImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const base64 = imageBuffer.toString("base64");
  const res = await groq.chat.completions.create({
    model: VISION_MODEL, max_tokens: 256,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: "text", text: `This is a podcast cover. Extract the podcast name and host. Reply ONLY in JSON: {"podcast_title":"name","host":"host or null"}` },
      ],
    }],
  });
  const text = res.choices[0]?.message?.content || "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { podcast_title?: string };
      return parsed.podcast_title || "";
    }
  } catch { /* ignore */ }
  return text.substring(0, 100);
}

async function extractFromAudio(audioBuffer: Buffer, audioExt: string): Promise<{ transcription: string; searchQuery: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-"));
  try {
    const inputPath = path.join(tmpDir, `input${audioExt || ".mp3"}`);
    await fs.writeFile(inputPath, audioBuffer);

    const compactPath = path.join(tmpDir, "compact.mp3");
    await runFfmpeg(["-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k", "-f", "mp3", "-y", compactPath]);

    let compactBuf = await fs.readFile(compactPath);
    const MAX = 24 * 1024 * 1024;
    if (compactBuf.length > MAX) compactBuf = compactBuf.slice(0, MAX);

    const audioFile = await toFile(compactBuf, "audio.mp3", { type: "audio/mp3" });
    const transcriptionResult = await groq.audio.transcriptions.create({
      file: audioFile, model: TRANSCRIPTION_MODEL, response_format: "json",
    });
    const transcription = transcriptionResult.text;

    const completion = await groq.chat.completions.create({
      model: TEXT_MODEL, max_tokens: 256,
      messages: [{
        role: "user",
        content: `From this podcast transcript, extract the podcast name if mentioned. Reply ONLY in JSON: {"podcast_title":"name or best guess","host":"host or null"}\n\nTranscript: "${transcription.substring(0, 500)}"`,
      }],
    });
    const content = completion.choices[0]?.message?.content || "";
    let searchQuery = "";
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { podcast_title?: string };
        searchQuery = parsed.podcast_title || transcription.substring(0, 100);
      }
    } catch { searchQuery = transcription.substring(0, 100); }

    return { transcription, searchQuery };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

const uploadFields = upload.fields([{ name: "image", maxCount: 1 }, { name: "audio", maxCount: 1 }]);

router.post("/recognize", uploadFields, async (req, res) => {
  const files = req.files as { image?: Express.Multer.File[]; audio?: Express.Multer.File[] } | undefined;
  const imageFile = files?.image?.[0];
  const audioFile = files?.audio?.[0];

  if (!imageFile && !audioFile) {
    res.status(400).json({ error: "يرجى رفع صورة غلاف أو مقطع صوتي" });
    return;
  }

  if (!isGroqAvailable()) {
    res.status(503).json({ error: "خدمة التعرف على البودكاست تتطلب GROQ_API_KEY." });
    return;
  }

  try {
    let searchQuery = "";
    let method: "image" | "audio" = "image";
    let transcription: string | null = null;

    if (imageFile) {
      method = "image";
      searchQuery = await extractFromImage(imageFile.buffer, imageFile.mimetype);
    } else if (audioFile) {
      method = "audio";
      const ext = path.extname(audioFile.originalname || ".mp3").toLowerCase();
      const result = await extractFromAudio(audioFile.buffer, ext);
      transcription = result.transcription;
      searchQuery = result.searchQuery;
    }

    const results = searchQuery ? await searchPodcasts(searchQuery) : [];
    res.json({ results, method, transcription });
  } catch (err: unknown) {
    req.log.error({ err }, "Error recognizing podcast");
    res.status(400).json({ error: "فشل التعرف على البودكاست. حاول مرة أخرى." });
  }
});

export default router;
