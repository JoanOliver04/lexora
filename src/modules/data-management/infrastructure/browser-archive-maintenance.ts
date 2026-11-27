const eventName = "lexora:archive-media-maintenance";

export async function recoverArchiveMedia(signal: AbortSignal): Promise<number | null> {
  try {
    for (let batch = 0; batch < 64; batch++) {
      const response = await fetch("/api/account/archive", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup" }),
        signal,
      });
      if (!response.ok) return response.status === 401 || response.status === 403 ? null : 60;
      const data: unknown = await response.json();
      if (data === null || typeof data !== "object" || !("more" in data)) return 60;
      if (data.more === true) continue;
      const wait = "retryAfter" in data ? data.retryAfter : null;
      return typeof wait === "number" && Number.isFinite(wait)
        ? Math.max(1, Math.min(3600, wait))
        : null;
    }
    return 1;
  } catch {
    return signal.aborted ? null : 60;
  }
}
export function requestMediaRecovery() {
  window.dispatchEvent(new Event(eventName));
}
export function watchArchiveMedia() {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined,
    running = false,
    again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    const delay = await recoverArchiveMedia(controller.signal);
    running = false;
    if (controller.signal.aborted) return;
    if (again) {
      again = false;
      timer = setTimeout(() => void run(), 0);
    } else if (delay !== null) timer = setTimeout(() => void run(), delay * 1000);
  };
  const wake = () => void run();
  window.addEventListener("online", wake);
  window.addEventListener(eventName, wake);
  wake();
  return () => {
    controller.abort();
    clearTimeout(timer);
    window.removeEventListener("online", wake);
    window.removeEventListener(eventName, wake);
  };
}
