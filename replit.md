# أدوات الوسائط — Media Tools

A comprehensive Arabic-only (RTL) media tools web application with 7 powerful tools.

## Architecture

**Monorepo (pnpm workspace)** with:
- `artifacts/media-tools` — React + Vite frontend (Arabic RTL, dark mode, Cairo font)
- `artifacts/api-server` — Express backend (serves at `/api` path prefix)
- `lib/api-spec` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react` — React Query hooks generated from OpenAPI spec
- `lib/integrations-openai-ai-server` — Replit-managed OpenAI client (no user API key needed)

## Routing

- Frontend: `/` — served by media-tools Vite dev server
- API: `/api` — served by api-server Express app

## The 7 Tools

1. **تنزيل الوسائط** (`/download`) — Download video/audio from any URL using yt-dlp; shows available formats/qualities
2. **قص المقاطع** (`/clipper`) — Cut YouTube clips by time range (HH:MM:SS) with quality/type selection (video/audio/mp3)
3. **تفريغ النص** (`/transcribe`) — Transcribe audio or video files to text using OpenAI gpt-4o-mini-transcribe
4. **تحويل لـ MP3** (`/to-mp3`) — Convert any video file to MP3 using ffmpeg
5. **التعرف على الأنمي** (`/anime`) — Recognize anime from screenshot (trace.moe + AniList) or text description (AniList search) with links to free streaming sites
6. **التعرف على البودكاست** (`/podcast`) — Identify podcasts from cover image (OpenAI vision) or audio clip (Whisper transcription) with iTunes search

## Backend Routes

- `POST /api/downloader/info` — Get video info and formats (yt-dlp)
- `POST /api/downloader/download` — Download media file (yt-dlp, binary response)
- `POST /api/clipper/clip` — Cut and download a clip (yt-dlp + ffmpeg, binary response)
- `POST /api/transcriber/transcribe` — Transcribe audio/video (ffmpeg + OpenAI Whisper)
- `POST /api/converter/to-mp3` — Convert video to MP3 (ffmpeg, binary response)
- `POST /api/anime/recognize` — Recognize anime from image or description
- `POST /api/podcast/recognize` — Recognize podcast from image or audio

## Key Technologies

- **yt-dlp** — Video/audio downloading and info fetching
- **ffmpeg** — Audio extraction, video clipping, format conversion
- **OpenAI gpt-4o-mini-transcribe** — Audio-to-text transcription (via Replit AI integration)
- **OpenAI gpt-5.2** — Vision AI for anime/podcast image recognition
- **trace.moe** — Anime scene recognition from screenshots
- **AniList GraphQL API** — Anime metadata (genres, description, MAL ID)
- **iTunes Search API** — Podcast search

## Frontend Design

- **Language**: Arabic only (RTL)
- **Font**: Cairo (Google Fonts)
- **Theme**: Dark mode only (deep blue/navy background, cyan primary accent)
- **Router**: Wouter
- **State**: React Query for API calls, raw fetch for binary downloads

## User Preferences

- All UI is Arabic only — no English UI elements
- RTL layout throughout
- Binary downloads (video, audio, clip, mp3) use raw fetch + Blob + URL.createObjectURL
- File uploads use raw fetch + FormData
