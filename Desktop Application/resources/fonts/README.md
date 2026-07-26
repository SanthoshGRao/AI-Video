# Bundled font for text/shape burn-in

Drop a `.ttf`/`.otf` font file here (e.g. an Inter or Montserrat static
weight matching the app's brand type) for `src/editor/export/fonts.ts` to
use with ffmpeg's `drawtext` filter when exporting text/subtitle/shape
clips.

Until a font is added here, `fonts.ts` falls back to
`C:\Windows\Fonts\arial.ttf` / `segoeui.ttf` on the machine doing the
export — fine for development, but exports should bundle their own font so
output is consistent across users' machines rather than depending on
whatever's installed locally.
