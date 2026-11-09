# Cutwave

Trim video and audio right in the browser. Files never leave your device.

## Features

- Fast cut (stream copy) or frame-accurate cut
- Compress to a target size (WhatsApp, Discord, email, Telegram)
- Extract audio to MP3
- Volume control (0–300%) with live preview
- Hardware acceleration via WebCodecs, multi-threaded ffmpeg.wasm fallback
- Large files read straight from disk (WORKERFS)
- Installable PWA, works offline, Web Share on mobile

## Stack

Next.js (App Router), TypeScript, ffmpeg.wasm, mediabunny (WebCodecs), lucide-react.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. On Windows you can also double-click `start.bat`.

`npm install` copies the ffmpeg cores into `public/ffmpeg` and `public/ffmpeg-mt` (see `scripts/copy-ffmpeg.mjs`).

## Deploy

Deploys on Vercel as-is. `next.config.ts` sets the COOP/COEP headers that multi-threaded ffmpeg needs.
