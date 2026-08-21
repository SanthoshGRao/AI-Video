/**
 * Shape of `window.desktopAPI`, injected by the Electron preload script
 * (Desktop Application/src/preload.ts) when running inside the desktop
 * shell. Undefined in the regular web app. Kept as a single ambient
 * declaration — TS requires all `declare global` merges of the same
 * interface member to agree on its type, so this must not be redeclared
 * per-file.
 */
export {};

declare global {
  interface Window {
    desktopAPI?: {
      signOut: () => void;
      /**
       * Renders an export using the desktop app's hardware-accelerated
       * ffmpeg engine (Desktop Application/src/editor/export) instead of
       * Remotion. Returns the same shape the old POST
       * /api/projects/[id]/export route did, so existing polling code
       * keeps working unmodified — see export-dialog.tsx.
       */
      exportNative?: (payload: {
        projectId: string;
        timeline: unknown;
        format: "mp4" | "mov" | "webm";
        resolution: string;
        aspectRatio: string;
        subtitleBurnIn: boolean;
        fps?: number;
      }) => Promise<{ job: { id: string } }>;
      /**
       * Stops an in-flight native export. Resolves false if the job had
       * already finished — see export-control.ts.
       */
      cancelExportNative?: (jobId: string) => Promise<boolean>;
      windowControls?: {
        minimize: () => void;
        toggleMaximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
        onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
      };
      updater?: {
        getState: () => Promise<any>;
        check: () => Promise<any>;
        download: () => Promise<void>;
        quitAndInstall: () => void;
        onStatusChange: (callback: (state: any) => void) => () => void;
      };
    };
  }
}
