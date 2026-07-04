/**
 * Default ProjectBundle used by the in-IndexedDB adapter when no host
 * backend is wired in. The shape and field semantics match the real
 * upstream models exactly, so the editor exercises the same code paths
 * production data will exercise. Replace `defaultAdapter.loadProjectBundle`
 * with a server call to remove this entirely.
 */
import type { ProjectBundle, ID } from "./contract";

export function defaultBundle(projectId: ID): ProjectBundle {
  const now = new Date().toISOString();
  return {
    project: {
      id: projectId,
      name: "Untitled Project",
      createdAt: now,
      updatedAt: now,
      width: 1920,
      height: 1080,
      fps: 30,
    },
    scriptVersion: {
      id: `${projectId}-script-1`,
      projectId,
      version: 1,
      approved: true,
      content:
        "Welcome to the property tour. Located in Nanjangud, this estate spans 4.22 acres of fertile land. The plantation features 1000 mature arecanut trees and 150 coconut trees, with an established irrigation system.",
      segments: [
        {
          id: "seg-1",
          text: "Welcome to the property tour. Located in Nanjangud, this estate spans 4.22 acres of fertile land.",
          start: 0,
          end: 6,
        },
        {
          id: "seg-2",
          text: "The plantation features 1000 mature arecanut trees and 150 coconut trees, with an established irrigation system.",
          start: 6,
          end: 14,
        },
      ],
    },
    audioAsset: {
      id: `${projectId}-audio`,
      projectId,
      url: "",
      duration: 14,
      mimeType: "audio/mpeg",
    },
    subtitleTrack: {
      id: `${projectId}-subs`,
      projectId,
      language: "en",
      cues: [
        { id: "c1", start: 0, end: 3, text: "Welcome to the property tour." },
        { id: "c2", start: 3, end: 6, text: "Located in Nanjangud." },
        { id: "c3", start: 6, end: 10, text: "4.22 acres of fertile land." },
        { id: "c4", start: 10, end: 14, text: "1000 arecanut, 150 coconut trees." },
      ],
    },
    extractedFacts: {
      location: "Nanjangud",
      acreage: "4.22 Acres",
      arecanutTrees: 1000,
      coconutTrees: 150,
    },
    mediaAssets: [],
  };
}
