"use client";

import { useEffect } from "react";
import { useEditor } from "@/lib/editor-v2/editor-store";
import { useEditorCore } from "@/lib/editor-v2/editor/store";
import { PX_PER_SECOND } from "@/lib/editor-v2/editor-data";
import { toast } from "sonner";

/**
 * Global keyboard shortcut listener. Mounted once at the editor root.
 * Skips shortcuts when typing in an input / textarea / contentEditable.
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTyping(e.target);
      const s = useEditor.getState();

      // ⌘K — command palette (works while typing too)
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.setCommandOpen(!s.commandOpen);
        return;
      }

      if (typing) return;

      // ? — shortcuts help
      if (e.key === "?") {
        e.preventDefault();
        s.setShortcutsOpen(true);
        return;
      }

      // Space — play/pause
      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
        return;
      }

      // ← / → frame step
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const fps = s.settings.fps;
        s.setPlayhead(Math.max(0, s.playhead - 1 / fps));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const fps = s.settings.fps;
        s.setPlayhead(s.playhead + 1 / fps);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        s.setPlayhead(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const clips = s.clips;
        const projectEnd = clips.length > 0 ? Math.max(...clips.map((c) => (c.start + c.width) / PX_PER_SECOND)) : 0;
        s.setPlayhead(projectEnd);
        return;
      }

      // File / Project (Modifiers first)
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        s.save(false);
        toast.success("Project saved");
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        s.setExportOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        toast.message("New project");
        return;
      }

      // Undo / Redo (Unified)
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        let undid = false;
        if (s.canUndo()) { s.undo(); undid = true; }
        if (undid) toast.message("Undo");
        return;
      }
      if ((mod && e.key.toLowerCase() === "z" && e.shiftKey) || (mod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        let redid = false;
        if (s.canRedo()) { s.redo(); redid = true; }
        if (redid) toast.message("Redo");
        return;
      }

      // Selection / Editing with Modifiers
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        s.selectAllClips();
        toast.message("All clips selected");
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (s.selectedClipIds.length > 0) {
          const targets = s.selectedClipIds.filter((id) => !s.clips.find((c) => c.id === id)?.frozen);
          if (targets.length === 0) {
            toast.message("Element is frozen");
            return;
          }
          s.pushHistory();
          targets.forEach((id) => s.duplicateClip(id));
          toast.success(targets.length > 1 ? `${targets.length} clips duplicated` : "Clip duplicated");
        }
        return;
      }

      // Editing without Modifiers
      if (!mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (s.selectedClipIds.length > 0) {
          const targets = s.selectedClipIds.filter((id) => !s.clips.find((c) => c.id === id)?.frozen);
          if (targets.length === 0) {
            toast.message("Element is frozen");
            return;
          }
          s.pushHistory();
          targets.forEach((id) => s.splitClipAtPlayhead(id));
          toast.success(targets.length > 1 ? `${targets.length} clips split at playhead` : "Clip split at playhead");
        } else {
          toast.message("Select a clip first");
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace")) {
        if (s.selectedTransitionId) {
          e.preventDefault();
          s.pushHistory();
          s.removeTransition(s.selectedTransitionId);
          toast.success("Transition deleted");
          return;
        }
        if (s.selectedElementId) {
          e.preventDefault();
          const clipOfEl = s.clips.find(c => c.elementId === s.selectedElementId);
          if (clipOfEl?.frozen) {
            toast.message("Element is frozen");
            return;
          }
          s.pushHistory();
          s.removeElement(s.selectedElementId);
          toast.success("Element deleted");
          return;
        }
        if (s.selectedClipIds.length > 0) {
          e.preventDefault();
          const frozenClips = s.selectedClipIds.filter(id => {
            const c = s.clips.find(x => x.id === id);
            return c?.frozen;
          });
          if (frozenClips.length > 0) {
            toast.message("Some selected elements are frozen");
            return;
          }
          s.pushHistory();
          if (e.altKey || s.settings.snapping) {
            s.selectedClipIds.forEach(id => s.rippleDeleteClip(id));
            toast.success("Ripple deleted");
          } else {
            s.selectedClipIds.forEach(id => s.removeClip(id));
            toast.success("Clip deleted");
          }
          s.selectClip(null);
          return;
        }
      }

      // Timeline / Zoom
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        s.setZoom(Math.min(2, +(s.zoom + 0.1).toFixed(2)));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        s.setZoom(Math.max(0.5, +(s.zoom - 0.1).toFixed(2)));
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const clips = s.clips;
        const projectEndPx = clips.length > 0 ? Math.max(...clips.map((c) => c.start + c.width)) : 0;
        const timelineWidth = document.getElementById("timeline-grid")?.clientWidth || 1000;
        if (projectEndPx > 0) {
           s.setZoom(Math.max(0.1, Math.min(2, timelineWidth / (projectEndPx + 200))));
        } else {
           s.setZoom(1);
        }
        toast.message("Timeline fit to content");
        return;
      }
      if (!mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const nextSnap = !s.settings.snapping;
        s.setSetting("snapping", nextSnap);
        toast.message(`Snap ${nextSnap ? "on" : "off"}`);
        return;
      }
      if (!mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toast.message("Fullscreen preview");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}
