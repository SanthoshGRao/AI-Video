/**
 * Rewriting bundled ids onto freshly created rows.
 *
 * A bundle carries the ids the source account used. Import mints new ones for
 * every row, so anything that pointed at an old id has to be repointed or
 * dropped. The timeline is where this actually matters: its clips reference
 * media, audio and subtitle rows by id, and a clip left pointing at an id that
 * no longer exists renders as a black gap.
 */

export type IdMap = Map<string, string>;

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Repoint one timeline document at the newly created rows.
 *
 * Clip and track ids are deliberately left alone: they are internal to the
 * timeline JSON rather than database keys, and transitions/tracks reference them
 * by value, so renaming them would mean rewriting those too for no benefit.
 *
 * A clip whose media or audio did not survive the trip is dropped outright —
 * along with the track entries and transitions that referenced it — because a
 * clip with a dangling asset id renders as a silent black gap that is far harder
 * to diagnose than a missing clip.
 */
export function remapTimeline(
  timeline: {
    tracks: unknown;
    clips: unknown;
    transitions: unknown;
    textLayers: unknown;
    settings: unknown;
  },
  maps: { media: IdMap; audio: IdMap; subtitle: IdMap }
): {
  tracks: unknown[];
  clips: UnknownRecord;
  transitions: unknown[];
  textLayers: unknown[];
  settings: UnknownRecord;
  droppedClipIds: string[];
} {
  const clipsIn = isRecord(timeline.clips) ? timeline.clips : {};
  const clipsOut: UnknownRecord = {};
  const droppedClipIds: string[] = [];

  for (const [clipId, raw] of Object.entries(clipsIn)) {
    if (!isRecord(raw)) continue;
    const clip: UnknownRecord = { ...raw };
    let usable = true;

    for (const [field, map] of [
      ["mediaAssetId", maps.media],
      ["audioAssetId", maps.audio],
      ["subtitleTrackId", maps.subtitle],
    ] as const) {
      const oldId = clip[field];
      if (typeof oldId !== "string" || !oldId) continue;
      const next = map.get(oldId);
      if (next) {
        clip[field] = next;
      } else {
        // A text or shape clip carries no asset and is still perfectly valid;
        // only drop the clip when the missing reference was its actual source.
        delete clip[field];
        if (field !== "subtitleTrackId") usable = false;
      }
    }

    if (usable) {
      clipsOut[clipId] = clip;
    } else {
      droppedClipIds.push(clipId);
    }
  }

  const dropped = new Set(droppedClipIds);

  const tracksIn = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const tracks = tracksIn.map((t) => {
    if (!isRecord(t)) return t;
    const clipIds = Array.isArray(t.clipIds)
      ? t.clipIds.filter((c) => typeof c === "string" && !dropped.has(c))
      : t.clipIds;
    return { ...t, clipIds };
  });

  const transitionsIn = Array.isArray(timeline.transitions)
    ? timeline.transitions
    : [];
  const transitions = transitionsIn.filter((tr) => {
    if (!isRecord(tr)) return false;
    const a = tr.clipAId;
    const b = tr.clipBId;
    // A transition is a join between two clips; if either end is gone the
    // transition has nothing left to join.
    return (
      !(typeof a === "string" && dropped.has(a)) &&
      !(typeof b === "string" && dropped.has(b))
    );
  });

  const settings: UnknownRecord = isRecord(timeline.settings)
    ? { ...timeline.settings }
    : {};

  // The media panel's own list of assets, including library imports that were
  // never placed on the timeline.
  if (Array.isArray(settings.projectMediaIds)) {
    settings.projectMediaIds = settings.projectMediaIds
      .map((id) => (typeof id === "string" ? maps.media.get(id) : undefined))
      .filter((id): id is string => !!id);
  }
  if (typeof settings.subtitleTrackId === "string") {
    const next = maps.subtitle.get(settings.subtitleTrackId);
    if (next) settings.subtitleTrackId = next;
    else delete settings.subtitleTrackId;
  }

  const textLayers = Array.isArray(timeline.textLayers) ? timeline.textLayers : [];

  return { tracks, clips: clipsOut, transitions, textLayers, settings, droppedClipIds };
}

/**
 * Every media-asset id a set of timelines refers to, whether through a clip or
 * through the media panel's `projectMediaIds`. Export uses this to pull in
 * library assets that the timeline depends on but that are not filed under the
 * project, so the bundle stands on its own.
 */
export function referencedMediaIds(
  timelines: Array<{ clips: unknown; settings: unknown }>
): Set<string> {
  const ids = new Set<string>();

  for (const t of timelines) {
    if (isRecord(t.clips)) {
      for (const clip of Object.values(t.clips)) {
        if (isRecord(clip) && typeof clip.mediaAssetId === "string") {
          ids.add(clip.mediaAssetId);
        }
      }
    }
    if (isRecord(t.settings) && Array.isArray(t.settings.projectMediaIds)) {
      for (const id of t.settings.projectMediaIds) {
        if (typeof id === "string") ids.add(id);
      }
    }
  }

  return ids;
}
