import { Signale } from 'signale';
import PQueue from 'p-queue';
import { httpCache } from './caches';

const logger = new Signale({
  scope: 'utils',
});

const queue = new PQueue({ concurrency: 10 })

export const hashImage = async (buffer: ArrayBuffer) => {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export async function smartFetch(url: string, options?: RequestInit): Promise<Response> {
  const cached = httpCache.get(url);
  const headers: Record<string, string> = options?.headers ? { ...(options.headers as any) } : {};
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }
  const response = await queue.add(() => fetch(url, { ...options, headers }));
  if (!response) return
  if (response.status === 304 && cached) {
    // Recreate a Response from the cached data.
    return new Response(cached.body, { headers: cached.headers });
  }
  const etag = response.headers.get('etag') || '';
  const body = await response.clone().text();
  httpCache.set(url, { etag, body, headers: response.headers });
  return response;
}

export function isLikelyRelevant(href: string, baseUrl: string, didFindButton: boolean): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(href, base);
    // Always follow links within the same host.
    if (target.host === base.host) return true;
    // For external domains, only follow if a button was found.
    return didFindButton;
  } catch (e) {
    return false;
  }
}
