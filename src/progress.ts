export interface ProgressNotification {
  method: 'notifications/progress';
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
    message?: string;
  };
}

export type SendNotification = (notification: ProgressNotification) => Promise<void>;

export interface ProgressOptions {
  sendNotification: SendNotification;
  progressToken: string | number | undefined;
  totalSeconds: number;
  label: string;
  /** Exposed for tests; production callers use the 2s default. */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 2000;

/**
 * Report elapsed time against an expected total while a solve runs.
 *
 * Clients use these notifications to hold their tool-call timeout open. When the
 * caller supplied no progressToken there is nothing to report against, so no
 * timer is created at all.
 *
 * Returns a `stop()` that is safe to call more than once.
 */
export function startProgress(opts: ProgressOptions): () => void {
  const { sendNotification, progressToken, totalSeconds, label } = opts;

  if (progressToken === undefined) {
    return () => {};
  }

  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const startedAt = Date.now();
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    // Never report past the total: a solve that runs long would otherwise
    // render as a progress bar beyond 100%.
    const progress = Math.min(elapsed, totalSeconds);

    // The transport can close mid-solve. A failed progress ping must not take
    // down the solve that is still usefully running.
    void sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total: totalSeconds,
        message: `${label} — ${Math.round(elapsed)}s elapsed`,
      },
    }).catch(() => {});
  }, intervalMs);

  // Do not hold the event loop open on account of progress reporting.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
  };
}
