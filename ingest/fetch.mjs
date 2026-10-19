export async function fetchWithRetry(url, {
  fetchImpl = globalThis.fetch,
  retries = 2,
  timeoutMs = 10_000,
  backoffMs = 100,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this Node runtime');
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
      return { text: await response.text(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt <= retries) await sleep(backoffMs * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(new Error(`Feed request failed after ${retries + 1} attempts: ${lastError?.message ?? 'unknown error'}`), { attempts: retries + 1, cause: lastError });
}
