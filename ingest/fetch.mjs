export async function fetchWithRetry(url, {
  fetchImpl = globalThis.fetch,
  retries = 2,
  timeoutMs = 10_000,
  backoffMs = 100,
  maxBytes = 2_000_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this Node runtime');
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { throw new Error('Source URL is invalid'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only HTTP(S) source URLs are allowed');
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json' } });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`Response exceeds ${maxBytes} byte limit`);
      return { text, attempts: attempt, status: response.status, headers: response.headers };
    } catch (error) {
      lastError = error;
      if (attempt <= retries) await sleep(backoffMs * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(new Error(`Feed request failed after ${retries + 1} attempts: ${lastError?.message ?? 'unknown error'}`), { attempts: retries + 1, cause: lastError });
}
