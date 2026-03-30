/**
 * Invidious API client — open-source YouTube mirror.
 * Used as a fallback when yt-dlp is blocked by YouTube's datacenter IP detection.
 * Invidious returns direct Google CDN stream URLs usable by ffmpeg.
 */

const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://yt.artemislena.eu",
  "https://iv.datura.network",
  "https://invidious.privacyredirect.com",
];

export interface InvidiousFormat {
  url: string;
  container: string;
  qualityLabel?: string;
  resolution?: string;
  encoding?: string;
  bitrate?: number;
  type?: string; // "video/mp4; codecs=..." or "audio/mp4; ..."
}

export interface InvidiousInfo {
  title: string;
  thumbnail: string | null;
  duration: number;
  uploader: string | null;
  videoFormats: InvidiousFormat[];
  audioUrl: string | null;
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/ID
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    // youtube.com/watch?v=ID
    const v = u.searchParams.get("v");
    if (v) return v;
    // youtube.com/shorts/ID
    const m = u.pathname.match(/\/(shorts|embed|v)\/([^/?]+)/);
    if (m) return m[2] || null;
  } catch {
    // ignore
  }
  return null;
}

async function fetchFromInstance(instance: string, videoId: string): Promise<InvidiousInfo> {
  const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,videoThumbnails,lengthSeconds,author,adaptiveFormats,formatStreams`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Invidious ${instance} returned ${res.status}`);
  const data = await res.json() as {
    title?: string;
    videoThumbnails?: Array<{ url: string; quality: string }>;
    lengthSeconds?: number;
    author?: string;
    adaptiveFormats?: Array<{
      url: string;
      type?: string;
      container?: string;
      qualityLabel?: string;
      encoding?: string;
      bitrate?: number;
    }>;
    formatStreams?: Array<{
      url: string;
      type?: string;
      container?: string;
      qualityLabel?: string;
      resolution?: string;
    }>;
  };

  if (!data.title) throw new Error("Invalid Invidious response");

  const thumbnail =
    data.videoThumbnails?.find((t) => t.quality === "maxresdefault")?.url ||
    data.videoThumbnails?.find((t) => t.quality === "sddefault")?.url ||
    data.videoThumbnails?.[0]?.url ||
    null;

  // Separate video-only and audio-only adaptive formats
  const videoFormats: InvidiousFormat[] = [];
  let audioUrl: string | null = null;

  for (const f of data.adaptiveFormats ?? []) {
    const type = f.type ?? "";
    if (type.startsWith("audio/")) {
      // Pick best audio (highest bitrate)
      if (!audioUrl || (f.bitrate && f.bitrate > 128000)) {
        audioUrl = f.url;
      }
    } else if (type.startsWith("video/") && f.qualityLabel) {
      videoFormats.push({
        url: f.url,
        container: f.container ?? "mp4",
        qualityLabel: f.qualityLabel,
        encoding: f.encoding,
        bitrate: f.bitrate,
        type,
      });
    }
  }

  // Fallback: use combined formatStreams for video URL if no adaptive video
  if (videoFormats.length === 0) {
    for (const f of data.formatStreams ?? []) {
      videoFormats.push({
        url: f.url,
        container: f.container ?? "mp4",
        qualityLabel: f.qualityLabel ?? f.resolution,
        type: f.type,
      });
    }
  }

  return {
    title: data.title,
    thumbnail,
    duration: data.lengthSeconds ?? 0,
    uploader: data.author ?? null,
    videoFormats,
    audioUrl,
  };
}

export async function getVideoInfoInvidious(url: string): Promise<InvidiousInfo> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("لا يمكن استخراج معرّف الفيديو من الرابط");

  let lastErr: Error = new Error("All Invidious instances failed");
  for (const instance of INSTANCES) {
    try {
      return await fetchFromInstance(instance, videoId);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}
