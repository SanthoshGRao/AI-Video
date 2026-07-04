import { sameMediaUrl } from "@/lib/editor/playback";

export function waitMediaReady(el: HTMLMediaElement, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Media load timed out"));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Media failed to load"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("error", onError);
    };
    el.addEventListener("canplay", onReady);
    el.addEventListener("error", onError);
  });
}

export async function primeAudio(
  el: HTMLAudioElement,
  url: string,
  timeSec: number
): Promise<void> {
  el.volume = 1;
  el.muted = false;
  if (!sameMediaUrl(el.src, url)) {
    el.src = url;
    el.load();
  }
  await waitMediaReady(el);
  el.currentTime = Math.max(0, timeSec);
}

export async function primeVideo(
  el: HTMLVideoElement,
  url: string,
  timeSec: number
): Promise<void> {
  el.muted = true;
  if (!sameMediaUrl(el.src, url)) {
    el.src = url;
    el.load();
  }
  await waitMediaReady(el);
  el.currentTime = Math.max(0, timeSec);
}
