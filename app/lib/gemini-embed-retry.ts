export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGeminiRateLimitError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /429|too many requests|quota|rate.?limit/i.test(msg);
}

/** 429 등 일시 오류 시 지수 백오프 재시도 */
export async function withGeminiEmbedRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 6;
  const baseDelayMs = opts?.baseDelayMs ?? 2000;
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isGeminiRateLimitError(e) || attempt === maxAttempts - 1) {
        throw e;
      }
      const wait = baseDelayMs * 2 ** attempt;
      await sleep(wait);
    }
  }
  throw last;
}
