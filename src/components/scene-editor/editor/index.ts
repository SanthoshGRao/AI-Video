/**
 * Public entry point for the editor package.
 * Host app should:
 *   1. Implement `loadProjectBundle` and `saveTimeline` on an EditorAdapter.
 *   2. Call `setEditorAdapter(myAdapter)` at app startup.
 *   3. Mount `<Editor projectId={...} />` wherever the editor lives.
 */
export { Editor } from "./components/Editor";
export { setEditorAdapter, getEditorAdapter, defaultAdapter } from "./adapter";
export { buildTimelineFromProjectBundle } from "./builder";
export { useEditorStore, editorHistory } from "./store";
export { validateTimeline, TimelineSchema } from "./schema";
export type {
  EditorAdapter,
  Project,
  ProjectBundle,
  ScriptVersion,
  ScriptSegment,
  AudioAsset,
  SubtitleTrack,
  SubtitleCue,
  ExtractedFacts,
  MediaAsset,
  MediaKind,
} from "./contract";
export type {
  Timeline,
  Track,
  Clip,
  MediaClip,
  TextClip,
  FactClip,
  SubtitleClip,
  AudioClip,
  Scene,
  Keyframe,
} from "./schema";
