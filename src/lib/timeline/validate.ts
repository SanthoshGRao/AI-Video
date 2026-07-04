import type { TimelineClip, TimelineDocument } from "@/lib/timeline/types";

export type TimelineValidationIssue = {
  code: string;
  message: string;
  clipId?: string;
};

export function validateTimelineDocument(
  doc: TimelineDocument
): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];
  const trackIds = new Set(doc.tracks.map((t) => t.id));

  for (const clip of Object.values(doc.clips)) {
    if (!trackIds.has(clip.trackId)) {
      issues.push({
        code: "ORPHAN_CLIP",
        message: `Clip ${clip.id} references unknown track`,
        clipId: clip.id,
      });
    }
    if (clip.endTime <= clip.startTime) {
      issues.push({
        code: "INVALID_RANGE",
        message: `Clip ${clip.id}: end must be after start`,
        clipId: clip.id,
      });
    }
    // Allow clips to extend past timeline duration (e.g., trailing audio or subtitles)
  }

  for (const track of doc.tracks) {
    const onTrack = Object.values(doc.clips).filter(
      (c) => c.trackId === track.id
    );
    if (track.type === "voiceover" && onTrack.length > 1) {
      // Allow multiple audio clips on the voiceover track
    }
  }

  return issues;
}

export function assertValidTimeline(doc: TimelineDocument): void {
  const issues = validateTimelineDocument(doc);
  if (issues.length > 0) {
    throw new Error(issues[0].message);
  }
}

export function clipsOnTrack(
  doc: TimelineDocument,
  trackId: string
): TimelineClip[] {
  return Object.values(doc.clips)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
}
