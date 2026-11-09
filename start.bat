@echo off
chcp 65001 >nul
cd /d "%~dp0"
title media-cutter dev

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist public\ffmpeg-mt\ffmpeg-core.wasm (
  call node scripts\copy-ffmpeg.mjs
)

echo Starting dev server at http://localhost:3000
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
call npm run dev

pause
