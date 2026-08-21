/**
 * export-control.ts — stopping an in-flight export.
 *
 * Two backends, same as starting one (see export-dialog.tsx):
 *   • Desktop shell — `cancelExportNative` kills the render window, decode
 *     pipeline and ffmpeg process (Desktop Application/src/editor/export/
 *     export-runner.ts `cancelExport`).
 *   • Web — DELETE the job row, which stops the UI polling and makes the
 *     server-side render's terminal DONE write a no-op.
 *
 * Either way the job ends up non-RENDERING, so the dialog's poll loop sees a
 * terminal state and stops on its own.
 */

export async function cancelExportJob(projectId: string, jobId: string): Promise<void> {
  if (typeof window !== "undefined" && window.desktopAPI?.cancelExportNative) {
    const stopped = await window.desktopAPI.cancelExportNative(jobId);
    // A false result means the render already finished between the click and
    // the IPC round-trip — nothing left to stop, and the job row is terminal.
    if (stopped) return;
  }

  const res = await fetch(`/api/projects/${projectId}/export/${jobId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to stop the export.");
  }
}
