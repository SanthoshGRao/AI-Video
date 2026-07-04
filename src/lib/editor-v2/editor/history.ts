import type { Command } from "./commands";
import type { ProjectSec } from "./types";

const LIMIT = 500;

export class HistoryEngine {
  private past: Command[] = [];
  private future: Command[] = [];

  /** Run a command, push its inverse to the undo stack. Returns the new project. */
  execute(project: ProjectSec, cmd: Command): ProjectSec {
    const inverse = cmd.inverse(project);
    const next = cmd.apply(project);
    this.past.push(inverse);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    return next;
  }

  undo(project: ProjectSec): ProjectSec {
    const inv = this.past.pop();
    if (!inv) return project;
    const redo = inv.inverse(project);
    const next = inv.apply(project);
    this.future.push(redo);
    return next;
  }

  redo(project: ProjectSec): ProjectSec {
    const cmd = this.future.pop();
    if (!cmd) return project;
    const inv = cmd.inverse(project);
    const next = cmd.apply(project);
    this.past.push(inv);
    return next;
  }

  canUndo() {
    return this.past.length > 0;
  }
  canRedo() {
    return this.future.length > 0;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  /** Diagnostic stats for the debug HUD. */
  stats() {
    return { past: this.past.length, future: this.future.length };
  }
}

export const history = new HistoryEngine();
