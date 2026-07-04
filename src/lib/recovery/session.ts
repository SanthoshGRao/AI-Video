const PENDING_KEY = (projectId: string) => `recovery-pending:${projectId}`;
const DISMISS_KEY = (projectId: string, snapshotId: string) =>
  `recovery-dismissed:${projectId}:${snapshotId}`;
const LAST_AUTOSAVE_KEY = (projectId: string) => `recovery-last-autosave:${projectId}`;

export function markRecoveryPending(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_KEY(projectId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearRecoveryPending(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_KEY(projectId));
  } catch {
    /* ignore */
  }
}

export function wasRecoveryPending(projectId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PENDING_KEY(projectId)) != null;
  } catch {
    return false;
  }
}

export function dismissRecoverySnapshot(projectId: string, snapshotId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISS_KEY(projectId, snapshotId), "1");
    clearRecoveryPending(projectId);
  } catch {
    /* ignore */
  }
}

export function isRecoveryDismissed(projectId: string, snapshotId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY(projectId, snapshotId)) === "1";
  } catch {
    return false;
  }
}

export function setLastAutosaveId(projectId: string, snapshotId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_AUTOSAVE_KEY(projectId), snapshotId);
  } catch {
    /* ignore */
  }
}
