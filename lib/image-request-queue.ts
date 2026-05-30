import "server-only";

type ImageRequestOptions = {
  label: string;
};

const globalQueue = globalThis as typeof globalThis & {
  __designImageRequestQueueState?: {
    active: number;
    waiters: Array<() => void>;
  };
};

const imageRequestTimeoutMs = 6 * 60 * 1000;
const imageRequestConcurrency = 2;

export function imageRequestOptions(): { timeout: number; maxRetries: number } {
  return { timeout: imageRequestTimeoutMs, maxRetries: 0 };
}

export async function runQueuedImageModelRequest<T>({ label }: ImageRequestOptions, request: () => Promise<T>): Promise<T> {
  await acquireImageRequestSlot();
  const startedAt = Date.now();
  try {
    return await request();
  } catch (error) {
    throw annotateImageRequestError(error, label, startedAt);
  } finally {
    releaseImageRequestSlot();
  }
}

export async function runQueuedImageModelRequestWithRetry<T>(
  { label, maxAttempts = 1, retryDelayMs = 1200 }: ImageRequestOptions & { maxAttempts?: number; retryDelayMs?: number },
  request: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      return await runQueuedImageModelRequest(
        { label: attempt === 1 ? label : `${label}/自动重试${attempt}` },
        request,
      );
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientImageRequestError(error)) break;
      await sleep(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

export function isTransientImageRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /502|503|504|bad gateway|gateway timeout|timeout|timed out|fetch failed|upstream|connection error|socket|econnreset|etimedout|eai_again|no available compatible accounts/i.test(message);
}

async function acquireImageRequestSlot() {
  const state = imageRequestQueueState();
  if (state.active < imageRequestConcurrency) {
    state.active += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    state.waiters.push(resolve);
  });
}

function releaseImageRequestSlot() {
  const state = imageRequestQueueState();
  const next = state.waiters.shift();
  if (next) {
    next();
    return;
  }
  state.active = Math.max(0, state.active - 1);
}

function imageRequestQueueState() {
  globalQueue.__designImageRequestQueueState ||= { active: 0, waiters: [] };
  return globalQueue.__designImageRequestQueueState;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function annotateImageRequestError(error: unknown, label: string, startedAt: number) {
  const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const message = error instanceof Error ? error.message : String(error || "图片模型请求失败");
  const wrapped = new Error(`图片请求失败（${label}，${durationSeconds}s）：${message}`);
  if (error instanceof Error && error.stack) wrapped.stack = error.stack;
  return wrapped;
}
