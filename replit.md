# أدوات الوسائط — Media Tools

A comprehensive Arabic-only (RTL) media tools web application with 7 distinct tools.

## Architecture

**Monorepo (pnpm workspace)** with:
- `artifacts/media-tools` — React + Vite frontend (Arabic RTL, dark mode, Cairo font)
- `artifacts/api-server` — Express backend (serves at `/api` path prefix)
- `lib/api-spec` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react` — React Query hooks generated from OpenAPI spec
- `lib/integrations-openai-ai-server` — Replit-managed OpenAI client (no user API key needed)

## Routing

- Frontend: `/` — served by media-tools Vite dev server
- API: `/api` — served by api-server Express app on port 8080

## The 7 Tools

1. **تنزيل الوسائط** (`/download`) — Download video/audio from any URL using yt-dlp; shows available formats/qualities
2. **قص المقاطع** (`/clipper`) — Cut YouTube clips by time range (HH:MM:SS) with quality/type selection (video/audio/mp3)
3. **صوت إلى نص** (`/audio-to-text`) — Transcribe audio files (MP3, WAV, M4A, OGG) to text using OpenAI gpt-4o-mini-transcribe
4. **فيديو إلى نص** (`/video-to-text`) — Extract audio from video via ffmpeg, then transcribe to text using OpenAI Whisper
5. **تحويل لـ MP3** (`/to-mp3`) — Convert any video file to MP3 using ffmpeg
6. **التعرف على الأنمي** (`/anime`) — Recognize anime from screenshot (trace.moe + AniList) or text description (AniList search) with links to free streaming sites
7. **التعرف على بودكاست** (`/podcast`) — Identify podcasts from cover image (OpenAI vision) or audio clip (Whisper transcription) with iTunes search

## Backend Routes

- `POST /api/downloader/info` — Get video info and formats (yt-dlp)
- `POST /api/downloader/download` — Download media file (yt-dlp, binary response)
- `POST /api/clipper/clip` — Cut and download a clip (yt-dlp + ffmpeg, binary response)
- `POST /api/transcriber/audio` — Transcribe audio files (OpenAI Whisper)
- `POST /api/transcriber/video` — Extract audio via ffmpeg, then transcribe (OpenAI Whisper)
- `POST /api/converter/to-mp3` — Convert video to MP3 (ffmpeg, binary response)
- `POST /api/anime/recognize` — Recognize anime from image (trace.moe) or text (AniList search)
- `POST /api/podcast/recognize` — Recognize podcast from image (OpenAI vision) or audio (Whisper + iTunes)

## Key Technologies

- **yt-dlp** — Video/audio downloading and info fetching
- **ffmpeg** — Audio extraction, video clipping, format conversion (installed as nix system dependency)
- **OpenAI gpt-4o-mini-transcribe** — Audio-to-text transcription (via Replit AI integration)
- **OpenAI gpt-4o** — Vision AI for anime/podcast image recognition
- **trace.moe** — Anime scene recognition from screenshots
- **AniList GraphQL API** — Anime metadata (genres, description, MAL ID)
- **iTunes Search API** — Podcast search

## Frontend Design

- **Language**: Arabic only (RTL)
- **Font**: Cairo (Google Fonts)
- **Theme**: Dark mode only (deep blue/navy background, cyan primary accent)
- **Router**: Wouter
- **State**: React Query hooks for API queries; raw fetch+FormData for file uploads; raw fetch+Blob for binary downloads

## User Preferences

- All UI is Arabic only — no English UI elements
- RTL layout throughout
- Binary downloads (video, audio, clip, mp3) use raw fetch + Blob + URL.createObjectURL
- File uploads use raw fetch + FormData (multipart)
- Typed interfaces used in all backend routes — no `any` type escapes
