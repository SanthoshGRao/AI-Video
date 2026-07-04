/**
 * Command pattern for the editor.
 * Each command knows how to apply itself and produce an inverse command for undo.
 *
 * No full-state snapshots — inverse ops only.
 */

import type { ClipSec, ProjectSec, Track } from "./types";

export interface Command {
  readonly type: string;
  apply(p: ProjectSec): ProjectSec;
  /** Build the inverse command BEFORE apply runs, using the pre-state. */
  inverse(pre: ProjectSec): Command;
}

/* ------------------------------ helpers ------------------------------ */
const replaceClip = (p: ProjectSec, id: string, patch: Partial<ClipSec>): ProjectSec => ({
  ...p,
  clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});

const requireClip = (p: ProjectSec, id: string): ClipSec => {
  const c = p.clips.find((x) => x.id === id);
  if (!c) throw new Error(`[command] clip not found: ${id}`);
  return c;
};

/* ------------------------------ clip commands ------------------------------ */

export class AddClipCmd implements Command {
  readonly type = "AddClip";
  constructor(public clip: ClipSec) {}
  apply(p: ProjectSec) {
    return { ...p, clips: [...p.clips, this.clip] };
  }
  inverse(): Command {
    return new RemoveClipCmd(this.clip.id);
  }
}

export class RemoveClipCmd implements Command {
  readonly type = "RemoveClip";
  constructor(public clipId: string) {}
  apply(p: ProjectSec) {
    return { ...p, clips: p.clips.filter((c) => c.id !== this.clipId) };
  }
  inverse(pre: ProjectSec): Command {
    return new AddClipCmd(requireClip(pre, this.clipId));
  }
}

export class UpdateClipCmd implements Command {
  readonly type = "UpdateClip";
  constructor(
    public clipId: string,
    public patch: Partial<ClipSec>,
  ) {}
  apply(p: ProjectSec) {
    return replaceClip(p, this.clipId, this.patch);
  }
  inverse(pre: ProjectSec): Command {
    const before = requireClip(pre, this.clipId);
    const restore: Partial<ClipSec> = {};
    for (const k of Object.keys(this.patch) as (keyof ClipSec)[]) {
      // @ts-expect-error index
      restore[k] = before[k];
    }
    return new UpdateClipCmd(this.clipId, restore);
  }
}

export class MoveClipCmd implements Command {
  readonly type = "MoveClip";
  constructor(
    public clipId: string,
    public startTime: number,
    public trackId: number,
  ) {}
  apply(p: ProjectSec) {
    const c = requireClip(p, this.clipId);
    const dur = c.endTime - c.startTime;
    return replaceClip(p, this.clipId, {
      startTime: this.startTime,
      endTime: this.startTime + dur,
      trackId: this.trackId,
    });
  }
  inverse(pre: ProjectSec): Command {
    const before = requireClip(pre, this.clipId);
    return new MoveClipCmd(this.clipId, before.startTime, before.trackId);
  }
}

export class TrimClipCmd implements Command {
  readonly type = "TrimClip";
  constructor(
    public clipId: string,
    public startTime: number,
    public endTime: number,
    public mediaIn?: number,
  ) {}
  apply(p: ProjectSec) {
    return replaceClip(p, this.clipId, {
      startTime: this.startTime,
      endTime: this.endTime,
      ...(this.mediaIn != null ? { mediaIn: this.mediaIn } : {}),
    });
  }
  inverse(pre: ProjectSec): Command {
    const b = requireClip(pre, this.clipId);
    return new TrimClipCmd(this.clipId, b.startTime, b.endTime, b.mediaIn);
  }
}

export class SplitClipCmd implements Command {
  readonly type = "SplitClip";
  constructor(
    public clipId: string,
    public at: number, // absolute time on timeline
    public newId: string,
  ) {}
  apply(p: ProjectSec) {
    const c = requireClip(p, this.clipId);
    if (this.at <= c.startTime + 1e-4 || this.at >= c.endTime - 1e-4) return p;
    const left: ClipSec = { ...c, endTime: this.at };
    const right: ClipSec = {
      ...c,
      id: this.newId,
      startTime: this.at,
      mediaIn: (c.mediaIn ?? 0) + (this.at - c.startTime),
    };
    return {
      ...p,
      clips: p.clips.flatMap((x) => (x.id === this.clipId ? [left, right] : [x])),
    };
  }
  inverse(): Command {
    return new MergeSplitCmd(this.clipId, this.newId);
  }
}

/** Inverse of SplitClip: removes the right half and restores the left's endTime. */
export class MergeSplitCmd implements Command {
  readonly type = "MergeSplit";
  constructor(
    public leftId: string,
    public rightId: string,
  ) {}
  apply(p: ProjectSec) {
    const right = p.clips.find((c) => c.id === this.rightId);
    if (!right) return p;
    return {
      ...p,
      clips: p.clips
        .filter((c) => c.id !== this.rightId)
        .map((c) => (c.id === this.leftId ? { ...c, endTime: right.endTime } : c)),
    };
  }
  inverse(pre: ProjectSec): Command {
    const right = pre.clips.find((c) => c.id === this.rightId);
    if (!right) throw new Error("[MergeSplit] right clip missing");
    return new SplitClipCmd(this.leftId, right.startTime, this.rightId);
  }
}

/* ------------------------------ track commands ------------------------------ */

export class AddTrackCmd implements Command {
  readonly type = "AddTrack";
  constructor(public track: Track) {}
  apply(p: ProjectSec) {
    return { ...p, tracks: [...p.tracks, this.track] };
  }
  inverse(): Command {
    return new RemoveTrackCmd(this.track.id);
  }
}

export class RemoveTrackCmd implements Command {
  readonly type = "RemoveTrack";
  constructor(public trackId: number) {}
  apply(p: ProjectSec) {
    return { ...p, tracks: p.tracks.filter((t) => t.id !== this.trackId) };
  }
  inverse(pre: ProjectSec): Command {
    const t = pre.tracks.find((x) => x.id === this.trackId);
    if (!t) throw new Error(`[RemoveTrack] track ${this.trackId} missing`);
    return new AddTrackCmd(t);
  }
}

export class UpdateTrackCmd implements Command {
  readonly type = "UpdateTrack";
  constructor(
    public trackId: number,
    public patch: Partial<Track>,
  ) {}
  apply(p: ProjectSec) {
    return {
      ...p,
      tracks: p.tracks.map((t) => (t.id === this.trackId ? { ...t, ...this.patch } : t)),
    };
  }
  inverse(pre: ProjectSec): Command {
    const t = pre.tracks.find((x) => x.id === this.trackId);
    if (!t) throw new Error(`[UpdateTrack] track ${this.trackId} missing`);
    const restore: Partial<Track> = {};
    for (const k of Object.keys(this.patch) as (keyof Track)[]) {
      // @ts-expect-error index
      restore[k] = t[k];
    }
    return new UpdateTrackCmd(this.trackId, restore);
  }
}

export class ReorderTracksCmd implements Command {
  readonly type = "ReorderTracks";
  constructor(public order: number[]) {}
  apply(p: ProjectSec) {
    const byId = new Map(p.tracks.map((t) => [t.id, t]));
    const next: Track[] = [];
    for (const id of this.order) {
      const t = byId.get(id);
      if (t) next.push(t);
    }
    // Append any tracks not in `order` (defensive).
    for (const t of p.tracks) if (!this.order.includes(t.id)) next.push(t);
    return { ...p, tracks: next };
  }
  inverse(pre: ProjectSec): Command {
    return new ReorderTracksCmd(pre.tracks.map((t) => t.id));
  }
}

/* ------------------------------ batch ------------------------------ */

export class BatchCmd implements Command {
  readonly type = "Batch";
  constructor(public cmds: Command[]) {}
  apply(p: ProjectSec) {
    return this.cmds.reduce((acc, c) => c.apply(acc), p);
  }
  inverse(pre: ProjectSec): Command {
    // Build inverses with the intermediate states they'll undo against.
    const inverses: Command[] = [];
    let state = pre;
    for (const c of this.cmds) {
      inverses.push(c.inverse(state));
      state = c.apply(state);
    }
    return new BatchCmd(inverses.reverse());
  }
}
