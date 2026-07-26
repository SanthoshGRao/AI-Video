# Bundled ffmpeg binaries

This folder is empty in source control — it needs a **full/GPL static Windows
build** of `ffmpeg.exe` and `ffprobe.exe`, not the minimal build the
`ffmpeg-static` npm package ships (that one has no NVENC/QSV/AMF encoders or
`libplacebo`, which the native export engine needs — see
`src/editor/export/ffmpeg-locate.ts`).

## Setup

1. Download a "full"/GPL Windows x64 static build, e.g.:
   - https://www.gyan.dev/ffmpeg/builds/ (the "full" build, not "essentials")
   - https://github.com/BtbN/FFmpeg-Builds/releases (`ffmpeg-master-latest-win64-gpl.zip`)
2. Extract `ffmpeg.exe` and `ffprobe.exe` (from the `bin/` folder of the
   download) directly into this directory:
   ```
   Desktop Application/resources/ffmpeg/ffmpeg.exe
   Desktop Application/resources/ffmpeg/ffprobe.exe
   ```

Until this is done, `ffmpeg-locate.ts` falls back to resolving `ffmpeg`/
`ffprobe` from `PATH` in dev builds (`npm run dev`) so local development
isn't blocked — but hardware encoder detection depends on the actual build
you have on PATH in that case. Packaged builds require the binaries to be
present here; `electron-builder.config.js` copies this folder's contents to
`resources/ffmpeg/` in the installed app.
