# ─────────────────────────────────────────────
# Base image with all system dependencies
# ─────────────────────────────────────────────
FROM node:20-slim

# Install ffmpeg, python3, pip for yt-dlp
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && python3 -m venv /opt/ytdlp-env \
    && /opt/ytdlp-env/bin/pip install --no-cache-dir yt-dlp \
    && ln -sf /opt/ytdlp-env/bin/yt-dlp /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace config files first (layer cache)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./

# Copy all package.json files for workspace resolution
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/media-tools/package.json ./artifacts/media-tools/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy full source code
COPY . .

# ── Build ──────────────────────────────────────
# 1) Build Vite frontend → artifacts/media-tools/dist/public
RUN pnpm --filter @workspace/media-tools run build

# 2) Build Express API → artifacts/api-server/dist
RUN pnpm --filter @workspace/api-server run build

# ── Runtime ────────────────────────────────────
ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/artifacts/media-tools/dist/public

EXPOSE 10000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
