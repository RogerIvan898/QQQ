// Low-priority work off the critical path, using the browser scheduler where
// it exists (Chromium: Telegram on Android and desktop) and falling back to
// requestIdleCallback / setTimeout elsewhere (iOS WebView has neither API).

type Cancel = () => void;

interface PostTaskScheduler {
  postTask: (
    task: () => void,
    options: { priority: 'background'; delay?: number; signal?: AbortSignal }
  ) => Promise<unknown>;
}

const getScheduler = (): PostTaskScheduler | null => {
  const { scheduler } = globalThis as {
    scheduler?: Partial<PostTaskScheduler>;
  };

  return scheduler?.postTask ? (scheduler as PostTaskScheduler) : null;
};

const postBackground = (task: () => void, delay = 0): Cancel | null => {
  const scheduler = getScheduler();

  if (!scheduler) {
    return null;
  }

  const controller = new AbortController();

  // Rejects with AbortError when cancelled; nothing to handle.
  scheduler
    .postTask(task, {
      priority: 'background',
      delay,
      signal: controller.signal,
    })
    .catch(() => undefined);

  return () => controller.abort();
};

/**
 * Soon, but behind anything user-visible: input, rendering, game events.
 * For work that must not be lost but shouldn't compete with an animation,
 * e.g. persisting state.
 */
export const runInBackground = (task: () => void): Cancel => {
  const posted = postBackground(task);

  if (posted) {
    return posted;
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout: 1000 });

    return () => window.cancelIdleCallback(handle);
  }

  const timer = window.setTimeout(task, 0);

  return () => window.clearTimeout(timer);
};

/**
 * Once the page has settled (idle time), at most `timeout` ms later.
 * For speculative work: prefetching chunks, warming up libraries.
 */
export const runWhenIdle = (task: () => void, timeout = 3000): Cancel => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout });

    return () => window.cancelIdleCallback(handle);
  }

  const posted = postBackground(task, timeout / 2);

  if (posted) {
    return posted;
  }

  const timer = window.setTimeout(task, timeout / 2);

  return () => window.clearTimeout(timer);
};
