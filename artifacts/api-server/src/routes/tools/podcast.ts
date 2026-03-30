import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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

function buildPodcastSourceLinks(title: string, feedUrl?: string): SourceLink[] {
  const encoded = encodeURIComponent(title);
  const links: SourceLink[] = [
    { name: "Apple Podcasts", url: `https://podcasts.apple.com/search?term=${encoded}`, icon: null },
    { name: "Spotify", url: `https://open.spotify.com/search/${encoded}/podcasts`, icon: null },
    { name: "Google Podcasts", url: `https://podcasts.google.com/search/${encoded}`, icon: null },
    { name: "Podchaser", url: `https://www.podchaser.com/search/podcasts/${encoded}`, icon: null },
  ];
  if (feedUrl) {
    links.push({ name: "RSS Feed", url: feedUrl, icon: null });
  }
  return links;
}

async function searchItunesPodcasts(query: string): Promise<PodcastResult[]> {
  try {
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
  } catch {
    return [];
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
      const base64 = imageFile.buffer.toString("base64");
      const mimeType = imageFile.mimetype;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: "text",
                text: `This is a podcast cover image. Extract the podcast name and host from this image. Respond in JSON format only:
                {"podcast_title": "title here", "host": "host name or null"}
                If you cannot identify the podcast, still respond with whatever text you can see.`,
              },
            ],
          },
        ],
      });

      const content = completion.choices[0]?.message?.content || "";
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as PodcastTitleJson;
          searchQuery = parsed.podcast_title || "";
        }
      } catch {
        searchQuery = content.substring(0, 100);
      }
    } else if (audioFile) {
      method = "audio";
      const ext = path.extname(audioFile.originalname || ".mp3").toLowerCase();
      const audioBuffer = audioFile.buffer;
      const audioFileObj = new File([audioBuffer], `audio${ext || ".mp3"}`, {
        type: audioFile.mimetype || "audio/mpeg",
      });

      const result = await openai.audio.transcriptions.create({
        file: audioFileObj,
        model: "gpt-4o-mini-transcribe",
        response_format: "json",
      });

      transcription = result.text;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `From this podcast audio transcript, extract the podcast name if mentioned. Respond in JSON:
            {"podcast_title": "title or best guess based on content", "host": "host name or null"}
            
            Transcript: "${transcription?.substring(0, 500)}"`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content || "";
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as PodcastTitleJson;
          searchQuery = parsed.podcast_title || transcription?.substring(0, 100) || "";
        }
      } catch {
        searchQuery = transcription?.substring(0, 100) || "";
      }
    }

    let results: PodcastResult[] = [];
    if (searchQuery) {
      results = await searchItunesPodcasts(searchQuery);
    }

    if (results.length === 0 && searchQuery) {
      results = [
        {
          title: searchQuery,
          description: null,
          image: null,
          author: null,
          categories: null,
          source_links: buildPodcastSourceLinks(searchQuery),
        },
      ];
    }

    res.json({ results, method, transcription });
  } catch (err: unknown) {
    req.log.error({ err }, "Error recognizing podcast");
    res.status(400).json({ error: "فشل التعرف على البودكاست. حاول مرة أخرى." });
  }
});

export default router;
