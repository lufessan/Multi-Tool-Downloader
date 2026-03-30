import { Router, type IRouter } from "express";
import multer from "multer";
import { groq, VISION_MODEL, isGroqAvailable } from "../../lib/groq-client";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
  character: string | null;
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
}

interface AniListPageResponse {
  data?: { Page?: { media?: AniListMedia[] } };
}

interface AniListSingleResponse {
  data?: { Media?: { idMal?: number; genres?: string[]; description?: string } };
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

function buildSourceLinks(title: string, anilistId?: number, malId?: number): SourceLink[] {
  const encoded = encodeURIComponent(title);
  const links: SourceLink[] = [];
  if (anilistId) links.push({ name: "AniList", url: `https://anilist.co/anime/${anilistId}`, icon: null });
  if (malId) links.push({ name: "MyAnimeList", url: `https://myanimelist.net/anime/${malId}`, icon: null });
  links.push({ name: "HiAnime", url: `https://hianime.to/search?keyword=${encoded}`, icon: null });
  links.push({ name: "GogoAnime", url: `https://anitaku.pe/search.html?keyword=${encoded}`, icon: null });
  links.push({ name: "Crunchyroll", url: `https://www.crunchyroll.com/search?q=${encoded}`, icon: null });
  return links;
}

async function getAniListInfo(anilistId: number): Promise<{ genres?: string[]; description?: string; mal_id?: number }> {
  try {
    const query = `query ($id: Int) { Media(id: $id, type: ANIME) { idMal genres description(asHtml: false) } }`;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
    });
    const data = await res.json() as AniListSingleResponse;
    const media = data?.data?.Media;
    return {
      genres: media?.genres || [],
      description: media?.description?.replace(/<[^>]*>/g, "").substring(0, 500),
      mal_id: media?.idMal,
    };
  } catch { return {}; }
}

async function searchAniListByText(query: string): Promise<AnimeResult[]> {
  const gql = `query ($search: String) {
    Page(page: 1, perPage: 5) {
      media(search: $search, type: ANIME) {
        id idMal title { romaji english native } coverImage { large } genres description(asHtml: false)
      }
    }
  }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  const data = await res.json() as AniListPageResponse;
  return (data?.data?.Page?.media || []).map((m) => {
    const title = m.title?.english || m.title?.romaji || m.title?.native || "غير معروف";
    return {
      title, title_ar: null, title_en: m.title?.english || m.title?.romaji || null,
      character: null, episode: null, similarity: null, from: null, to: null,
      thumbnail: m.coverImage?.large || null, anilist_id: m.id, mal_id: m.idMal || null,
      genres: m.genres || null,
      description: m.description?.replace(/<[^>]*>/g, "").substring(0, 500) || null,
      source_links: buildSourceLinks(title, m.id, m.idMal),
    };
  });
}

async function recognizeWithGroq(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ title: string | null; character: string | null }> {
  const base64 = imageBuffer.toString("base64");
  const res = await groq.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 256,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        {
          type: "text",
          text: `Look carefully at this image. If you can clearly identify an anime series from it, respond ONLY with valid JSON: {"anime_title":"exact official title in English or romaji","character":"character name or null"}\nIf this is NOT an anime screenshot, or you are not confident, respond with: {"anime_title":null,"character":null}\nDo NOT guess. Only respond with a title if you are certain.`,
        },
      ],
    }],
  });
  const text = res.choices[0]?.message?.content || "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { anime_title?: string | null; character?: string | null };
      return {
        title: parsed.anime_title || null,
        character: parsed.character || null,
      };
    }
  } catch { /* ignore */ }
  return { title: null, character: null };
}

router.post("/recognize", upload.single("image"), async (req, res) => {
  const description = (req.body as { description?: string }).description?.trim();
  const imageFile = req.file;

  if (!imageFile && !description) {
    res.status(400).json({ error: "يرجى رفع صورة أو إدخال وصف" });
    return;
  }

  try {
    // ── Text description only ──────────────────────────────────────────────
    if (!imageFile && description) {
      const results = await searchAniListByText(description);
      res.json({ results, method: "text" });
      return;
    }

    if (!imageFile) { res.json({ results: [], method: "image" }); return; }

    // ── Image: try trace.moe first ─────────────────────────────────────────
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.mimetype });
    formData.append("image", blob, imageFile.originalname || "image.jpg");

    const traceMoeRes = await fetch("https://api.trace.moe/search?anilistInfo", {
      method: "POST", body: formData,
    });

    if (!traceMoeRes.ok) throw new Error(`trace.moe error: ${traceMoeRes.status}`);

    const traceMoeData = await traceMoeRes.json() as TraceMoeResponse;
    const allResults = traceMoeData.result || [];
    const top = allResults[0];
    const similarity = top?.similarity ?? 0;

    // trace.moe matched with sufficient confidence (≥ 87%)
    if (allResults.length > 0 && similarity >= 0.87) {
      const r = top;
      const anilistRaw = r.anilist;
      const anilistId: number | null =
        typeof anilistRaw === "number" ? anilistRaw
        : typeof anilistRaw === "object" && anilistRaw?.id !== undefined ? Number(anilistRaw.id) : null;

      if (anilistId !== null) {
        const anilistObj = typeof anilistRaw === "object" ? anilistRaw as TraceMoeAnilist : null;
        const titleEn = anilistObj?.title?.english || anilistObj?.title?.romaji || String(anilistId);
        const extra = await getAniListInfo(anilistId);

        res.json({
          results: [{
            title: titleEn || "غير معروف", title_ar: null, title_en: titleEn,
            character: null,
            episode: r.episode != null ? Number(r.episode) : null,
            similarity: Math.round(similarity * 100),
            from: r.from ?? null, to: r.to ?? null,
            thumbnail: r.image || null, anilist_id: anilistId,
            mal_id: extra.mal_id || null, genres: extra.genres || null,
            description: extra.description || null,
            source_links: buildSourceLinks(titleEn, anilistId, extra.mal_id),
          }],
          method: "image",
        });
        return;
      }
    }

    // trace.moe gave low confidence or no result — try Groq vision
    if (isGroqAvailable()) {
      const { title: groqTitle, character } = await recognizeWithGroq(imageFile.buffer, imageFile.mimetype);

      if (groqTitle) {
        const anilistResults = await searchAniListByText(groqTitle);
        if (anilistResults.length > 0) {
          res.json({
            results: anilistResults.map((r) => ({ ...r, character })),
            method: "image",
          });
          return;
        }
      }
    }

    // If there was a medium-confidence trace.moe result (≥ 50%), still return it
    if (allResults.length > 0 && similarity >= 0.50) {
      const r = top;
      const anilistRaw = r.anilist;
      const anilistId: number | null =
        typeof anilistRaw === "number" ? anilistRaw
        : typeof anilistRaw === "object" && anilistRaw?.id !== undefined ? Number(anilistRaw.id) : null;

      if (anilistId !== null) {
        const anilistObj = typeof anilistRaw === "object" ? anilistRaw as TraceMoeAnilist : null;
        const titleEn = anilistObj?.title?.english || anilistObj?.title?.romaji || String(anilistId);
        const extra = await getAniListInfo(anilistId);

        res.json({
          results: [{
            title: titleEn || "غير معروف", title_ar: null, title_en: titleEn,
            character: null,
            episode: r.episode != null ? Number(r.episode) : null,
            similarity: Math.round(similarity * 100),
            from: r.from ?? null, to: r.to ?? null,
            thumbnail: r.image || null, anilist_id: anilistId,
            mal_id: extra.mal_id || null, genres: extra.genres || null,
            description: extra.description || null,
            source_links: buildSourceLinks(titleEn, anilistId, extra.mal_id),
          }],
          method: "image",
        });
        return;
      }
    }

    // Nothing found
    res.json({ results: [], method: "image" });

  } catch (err: unknown) {
    req.log.error({ err }, "Error recognizing anime");
    res.status(400).json({ error: "فشل التعرف على الأنمي. حاول مرة أخرى." });
  }
});

export default router;
