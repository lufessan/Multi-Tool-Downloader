import { Router, type IRouter } from "express";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

interface SourceLink {
  name: string;
  url: string;
  icon: string | null;
}

interface AnimeResult {
  title: string;
  title_ar: string | null;
  title_en: string | null;
  episode: number | null;
  similarity: number | null;
  from: number | null;
  to: number | null;
  thumbnail: string | null;
  anilist_id: number | null;
  mal_id: number | null;
  genres: string[] | null;
  description: string | null;
  source_links: SourceLink[];
}

interface AniListTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

interface AniListMedia {
  id: number;
  idMal?: number;
  title: AniListTitle;
  coverImage?: { large?: string };
  genres?: string[];
  description?: string;
  episodes?: number;
}

interface AniListPageResponse {
  data?: {
    Page?: {
      media?: AniListMedia[];
    };
  };
}

interface AniListSingleResponse {
  data?: {
    Media?: {
      idMal?: number;
      genres?: string[];
      description?: string;
    };
  };
}

interface TraceMoeAnilist {
  id?: number;
  title?: AniListTitle;
}

interface TraceMoeResult {
  anilist?: number | TraceMoeAnilist;
  episode?: number | string;
  similarity?: number;
  from?: number;
  to?: number;
  image?: string;
}

interface TraceMoeResponse {
  result?: TraceMoeResult[];
}

interface OpenAIAnimeJson {
  anime_title?: string;
}

function buildSourceLinks(title: string, anilistId?: number, malId?: number): SourceLink[] {
  const links: SourceLink[] = [];
  const encoded = encodeURIComponent(title);

  if (anilistId) {
    links.push({ name: "AniList", url: `https://anilist.co/anime/${anilistId}`, icon: null });
  }
  if (malId) {
    links.push({ name: "MyAnimeList", url: `https://myanimelist.net/anime/${malId}`, icon: null });
  }
  links.push({ name: "Zoro.to", url: `https://hianime.to/search?keyword=${encoded}`, icon: null });
  links.push({ name: "GogoAnime", url: `https://anitaku.pe/search.html?keyword=${encoded}`, icon: null });
  links.push({ name: "Crunchyroll", url: `https://www.crunchyroll.com/search?q=${encoded}`, icon: null });
  links.push({ name: "Kitsu", url: `https://kitsu.app/anime?text=${encoded}`, icon: null });

  return links;
}

async function getAniListInfo(anilistId: number): Promise<{ genres?: string[]; description?: string; mal_id?: number }> {
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          idMal
          genres
          description(asHtml: false)
        }
      }
    `;
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
    });
    const data = await response.json() as AniListSingleResponse;
    const media = data?.data?.Media;
    return {
      genres: media?.genres || [],
      description: media?.description?.replace(/<[^>]*>/g, "").substring(0, 500) || undefined,
      mal_id: media?.idMal || undefined,
    };
  } catch {
    return {};
  }
}

async function searchAniListByText(query: string): Promise<AnimeResult[]> {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          idMal
          title { romaji english native }
          coverImage { large }
          genres
          description(asHtml: false)
          episodes
        }
      }
    }
  `;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  const data = await response.json() as AniListPageResponse;
  const medias = data?.data?.Page?.media || [];

  return medias.map((m) => {
    const title = m.title?.english || m.title?.romaji || m.title?.native || "غير معروف";
    return {
      title,
      title_ar: null,
      title_en: m.title?.english || m.title?.romaji || null,
      episode: null,
      similarity: null,
      from: null,
      to: null,
      thumbnail: m.coverImage?.large || null,
      anilist_id: m.id || null,
      mal_id: m.idMal || null,
      genres: m.genres || null,
      description: m.description?.replace(/<[^>]*>/g, "").substring(0, 500) || null,
      source_links: buildSourceLinks(title, m.id, m.idMal),
    };
  });
}

router.post(
  "/recognize",
  upload.single("image"),
  async (req, res) => {
    const description = (req.body as { description?: string }).description;
    const imageFile = req.file;

    if (!imageFile && !description) {
      res.status(400).json({ error: "يرجى رفع صورة أو إدخال وصف" });
      return;
    }

    try {
      if (imageFile) {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.mimetype });
        formData.append("image", blob, imageFile.originalname || "image.jpg");

        const traceMoeRes = await fetch("https://api.trace.moe/search?anilistInfo", {
          method: "POST",
          body: formData,
        });

        if (!traceMoeRes.ok) {
          throw new Error(`trace.moe error: ${traceMoeRes.status}`);
        }

        const traceMoeData = await traceMoeRes.json() as TraceMoeResponse;
        const traceResults = (traceMoeData.result || []).slice(0, 3);

        if (traceResults.length === 0) {
          const base64 = imageFile.buffer.toString("base64");
          const mimeType = imageFile.mimetype;

          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 1024,
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
                    text: `What anime is this from? Please respond in JSON format:
                    {"anime_title": "title in English/romaji", "character": "character name or null", "episode_context": "any details about the scene"}`,
                  },
                ],
              },
            ],
          });

          const content = completion.choices[0]?.message?.content || "";
          let parsedTitle = "غير محدد";
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as OpenAIAnimeJson;
              parsedTitle = parsed.anime_title || "غير محدد";
            }
          } catch { /* ignore parse errors */ }

          const anilistResults = await searchAniListByText(parsedTitle);
          res.json({ results: anilistResults, method: "image" });
          return;
        }

        const results: AnimeResult[] = [];
        const seen = new Set<number>();

        for (const r of traceResults) {
          const anilistRaw = r.anilist;
          const anilistId: number | null =
            typeof anilistRaw === "number"
              ? anilistRaw
              : typeof anilistRaw === "object" && anilistRaw !== null && anilistRaw.id !== undefined
              ? Number(anilistRaw.id)
              : null;

          if (anilistId === null || seen.has(anilistId)) continue;
          seen.add(anilistId);

          const anilistObj = typeof anilistRaw === "object" && anilistRaw !== null ? anilistRaw as TraceMoeAnilist : null;
          const titleEn = anilistObj?.title?.english || anilistObj?.title?.romaji || String(anilistId);
          const titleRomaji = anilistObj?.title?.romaji || null;

          let genres: string[] | null = null;
          let descriptionText: string | null = null;
          let malId: number | null = null;

          const extra = await getAniListInfo(anilistId);
          genres = extra.genres || null;
          descriptionText = extra.description || null;
          malId = extra.mal_id || null;

          results.push({
            title: titleEn || titleRomaji || "غير معروف",
            title_ar: null,
            title_en: titleEn,
            episode: r.episode !== undefined && r.episode !== null ? Number(r.episode) : null,
            similarity: r.similarity ? Math.round(r.similarity * 100) : null,
            from: r.from ?? null,
            to: r.to ?? null,
            thumbnail: r.image || null,
            anilist_id: anilistId,
            mal_id: malId,
            genres,
            description: descriptionText,
            source_links: buildSourceLinks(titleEn, anilistId, malId ?? undefined),
          });
        }

        res.json({ results, method: "image" });
      } else if (description) {
        const anilistResults = await searchAniListByText(description);
        res.json({ results: anilistResults, method: "text" });
      }
    } catch (err: unknown) {
      req.log.error({ err }, "Error recognizing anime");
      res.status(400).json({ error: "فشل التعرف على الأنمي. حاول مرة أخرى." });
    }
  }
);

export default router;
