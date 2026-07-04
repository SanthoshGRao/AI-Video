/** Seek a video element to an exact time and wait until the frame is ready to draw. */
export async function seekVideoForExport(
  video: HTMLVideoElement,
  timeSec: number,
  timeoutMs = 100,
): Promise<void> {
  const maxTime = Number.isFinite(video.duration) && video.duration > 0
    ? Math.max(0, video.duration - 0.04)
    : Math.max(0, timeSec);
  const target = Math.max(0, Math.min(timeSec, maxTime));

  if (Math.abs(video.currentTime - target) < 0.02) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      video.removeEventListener("loadeddata", finish);
      resolve();
    };

    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("loadeddata", finish, { once: true });

    try {
      video.pause();
      video.currentTime = target;
      if (!video.seeking) {
        finish();
        return;
      }
    } catch {
      finish();
      return;
    }

    window.setTimeout(finish, timeoutMs);
  });
}
