// Reads crawl options from a form (admin console and My company). Field names match the workers' CrawlConfig.
import type { CrawlOptions } from './types';

const lines = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? v.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).map((p) => (p.startsWith('/') ? p : `/${p}`)) : [];
const int = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = typeof v === 'string' && v.trim() ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : undefined;
};

// "acme.com" → "https://acme.com". Undefined for anything that isn't a web address.
export function websiteUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function crawlOptionsFrom(fd: FormData, startUrl: string): CrawlOptions {
  const strategy = fd.get('strategy');
  return {
    start_url: startUrl,
    include: lines(fd.get('include')),
    exclude: lines(fd.get('exclude')),
    scope: lines(fd.get('scope')),
    max_pages: int(fd.get('maxPages'), 1, 20000),
    max_depth: int(fd.get('maxDepth'), 0, 50),
    strategy: strategy === 'dfs' ? 'dfs' : 'bfs',
    render_js: fd.get('renderJs') === 'on',
  };
}
