import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const MAX_INLINE_BYTES = 6.5 * 1024 * 1024;

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

interface PodcastIndexResponse {
  feeds?: PodcastIndexFeed[];
}

interface ItunesPodcast {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  genres?: string[];
  feedUrl?: string;
}

interface ItunesResponse {
  results?: ItunesPodcast[];
}

interface PodcastTitleJson {
  podcast_title?: string;
  host?: string;
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

function buildPodcastSourceLinks(title: string, feedUrl?: string): SourceLink[] {
  const encoded = encodeURIComponent(title);
  const links: SourceLink[] = [
    { name: "Apple Podcasts", url: `https://podcasts.apple.com/search?term=${encoded}`, icon: null },
    { name: "Spotify", url: `https://open.spotify.com/search/${encoded}/podcasts`, icon: null },
    { name: "Podchaser", url: `https://www.podchaser.com/search/podcasts/${encoded}`, icon: null },
  ];
  if (feedUrl) {
    links.unshift({ name: "RSS Feed", url: feedUrl, icon: null });
  }
  return links;
}

async function searchPodcastIndex(query: string): Promise<PodcastResult[]> {
  const apiKey = process.env["PODCAST_INDEX_API_KEY"];
  const apiSecret = process.env["PODCAST_INDEX_API_SECRET"];
  if (!apiKey || !apiSecret) return [];

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const authHash = crypto
    .createHash("sha1")
    .update(apiKey + apiSecret + timestamp)
    .digest("hex");

  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://api.podcastindex.org/api/1.0/search/byterm?q=${encoded}&max=5`,
    {
      headers: {
        "X-Auth-Key": apiKey,
        "X-Auth-Date": timestamp,
        "Authorization": authHash,
        "User-Agent": "MediaToolsApp/1.0",
      },
    }
  );

  if (!res.ok) return [];

  const data = await res.json() as PodcastIndexResponse;
  return (data.feeds || []).map((f) => ({
    title: f.title || "غير معروف",
    description: f.description || null,
    image: f.artwork || f.image || null,
    author: f.author || f.ownerName || null,
    categories: f.categories ? Object.values(f.categories) : null,
    source_links: buildPodcastSourceLinks(f.title || query, f.url || f.link),
  }));
}

async function searchItunesPodcasts(query: string): Promise<PodcastResult[]> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encoded}&entity=podcast&limit=5`
  );
  const data = await res.json() as ItunesResponse;
  return (data.results || []).map((p) => ({
    title: p.trackName || p.collectionName || "غير معروف",
    description: null,
    image: p.artworkUrl600 || p.artworkUrl100 || null,
    author: p.artistName || null,
    categories: p.genres || null,
    source_links: buildPodcastSourceLinks(
      p.trackName || p.collectionName || query,
      p.feedUrl
    ),
  }));
}

async function searchPodcasts(query: string): Promise<PodcastResult[]> {
  try {
    const indexResults = await searchPodcastIndex(query);
    if (indexResults.length > 0) return indexResults;
    return await searchItunesPodcasts(query);
  } catch {
    return [];
  }
}

// Extract podcast name from cover image using Gemini vision
async function extractPodcastFromImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const base64 = imageBuffer.toString("base64");
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text: `This is a podcast cover image. Extract the podcast name and host. Respond ONLY in valid JSON:
{"podcast_title": "name here", "host": "host name or null"}`,
          },
        ],
      },
    ],
    config: { maxOutputTokens: 8192 },
  });

  const content = response.text ?? "";
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as PodcastTitleJson;
      return parsed.podcast_title || "";
    }
  } catch { /* ignore */ }
  return content.substring(0, 100);
}

// Transcribe audio clip and extract podcast name using Gemini
async function extractPodcastFromAudio(audioBuffer: Buffer, audioExt: string): Promise<{ transcription: string; searchQuery: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-"));

  try {
    const inputPath = path.join(tmpDir, `input${audioExt || ".mp3"}`);
    await fs.writeFile(inputPath, audioBuffer);

    // Convert to compact MP3
    const compactPath = path.join(tmpDir, "compact.mp3");
    await runFfmpeg([
      "-i", inputPath,
      "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
      "-f", "mp3", "-y", compactPath,
    ]);

    let audioToTranscribe = await fs.readFile(compactPath);

    // Trim to max inline size if needed
    if (audioToTranscribe.length > MAX_INLINE_BYTES) {
      audioToTranscribe = audioToTranscribe.slice(0, MAX_INLINE_BYTES);
    }

    const base64 = audioToTranscribe.toString("base64");

    // Ask Gemini to transcribe AND identify the podcast in one call
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { inlineData: { mimeType: "audio/mp3", data: base64 } },
            {
              text: `Listen to this podcast audio clip. Transcribe it and identify the podcast name or show if mentioned. Respond ONLY in valid JSON:
{"transcription": "full transcription here", "podcast_title": "podcast name or best guess based on content", "host": "host name or null"}`,
            },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const content = response.text ?? "";
    let transcription = "";
    let searchQuery = "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { transcription?: string; podcast_title?: string };
        transcription = parsed.transcription || "";
        searchQuery = parsed.podcast_title || transcription.substring(0, 100);
      }
    } catch {
      transcription = content;
      searchQuery = content.substring(0, 100);
    }

    return { transcription, searchQuery };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

router.post("/recognize", uploadFields, async (req, res) => {
  const files = req.files as { image?: Express.Multer.File[]; audio?: Express.Multer.File[] } | undefined;
  const imageFile = files?.image?.[0];
  const audioFile = files?.audio?.[0];

  if (!imageFile && !audioFile) {
    res.status(400).json({ error: "يرجى رفع صورة غلاف أو مقطع صوتي" });
    return;
  }

  try {
    let searchQuery = "";
    let method: "image" | "audio" = "image";
    let transcription: string | null = null;

    if (imageFile) {
      method = "image";
      searchQuery = await extractPodcastFromImage(imageFile.buffer, imageFile.mimetype);
    } else if (audioFile) {
      method = "audio";
      const ext = path.extname(audioFile.originalname || ".mp3").toLowerCase();
      const result = await extractPodcastFromAudio(audioFile.buffer, ext);
      transcription = result.transcription;
      searchQuery = result.searchQuery;
    }

    const results: PodcastResult[] = searchQuery ? await searchPodcasts(searchQuery) : [];

    res.json({ results, method, transcription });
  } catch (err: unknown) {
    req.log.error({ err }, "Error recognizing podcast");
    res.status(400).json({ error: "فشل التعرف على البودكاست. حاول مرة أخرى." });
  }
});

export default router;
