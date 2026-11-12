// Pure helpers for the crawl explorer: folder tree, link map, search. No I/O, easy to test.

export type EntryStatus = 'ok' | 'unchanged' | 'carried' | 'failed' | 'skipped';
// One line of a crawl's manifest.jsonl (written by workers/valuehq_workers/crawl/recorder.py).
export interface ManifestEntry {
  url: string; status: EntryStatus; kind?: 'page' | 'file'; finalUrl?: string; httpStatus?: number | null;
  contentType?: string; sha256?: string; rawKey?: string; textKey?: string | null; previousTextKey?: string; previousRawKey?: string;
  title?: string | null; description?: string | null; chars?: number; bytes?: number;
  etag?: string | null; lastModified?: string | null; fetchedAt?: string; checkedAt?: string;
  depth?: number; attempts?: number; reason?: string; error?: string;
  fetchMs?: number; processMs?: number; parent?: string; links?: string[]; linkCount?: number;
}
export interface CorpusRow { url: string; title?: string | null; textKey?: string; text: string }

export const isGood = (e: ManifestEntry) => e.status === 'ok' || e.status === 'unchanged' || e.status === 'carried';
export const pathOf = (url: string) => { try { return new URL(url).pathname || '/'; } catch { return url; } };
export const textKeyOf = (e: ManifestEntry) => (isGood(e) ? e.textKey : e.previousTextKey) ?? undefined;

// ---------- folder tree (by URL path) ----------
export interface FolderNode { name: string; path: string; pages: ManifestEntry[]; children: FolderNode[]; total: number; failed: number }

export function folderTree(entries: ManifestEntry[]): FolderNode {
  const root: FolderNode = { name: '/', path: '/', pages: [], children: [], total: 0, failed: 0 };
  const byPath = new Map<string, FolderNode>([['/', root]]);
  for (const e of [...entries].sort((a, b) => pathOf(a.url).localeCompare(pathOf(b.url)))) {
    const segs = pathOf(e.url).split('/').filter(Boolean);
    // /blog/post -> folder /blog ; /blog/ (index) -> folder /blog ; / -> root
    const folderSegs = pathOf(e.url).endsWith('/') ? segs : segs.slice(0, -1);
    let node = root;
    let current = '';
    for (const seg of folderSegs) {
      current += `/${seg}`;
      let child = byPath.get(current);
      if (!child) {
        child = { name: seg, path: current, pages: [], children: [], total: 0, failed: 0 };
        byPath.set(current, child);
        node.children.push(child);
      }
      node = child;
    }
    node.pages.push(e);
  }
  const count = (n: FolderNode): void => {
    n.children.forEach(count);
    n.total = n.pages.length + n.children.reduce((s, c) => s + c.total, 0);
    n.failed = n.pages.filter((p) => p.status === 'failed').length + n.children.reduce((s, c) => s + c.failed, 0);
  };
  count(root);
  return root;
}

// ---------- link map (who found whom) ----------
export interface MapNode { entry: ManifestEntry; children: MapNode[] }

// Tree of pages by the page each was first found on. Pages found from the sitemap, or kept from an
// earlier crawl without a parent, sit at the top level.
export function linkTree(entries: ManifestEntry[], startUrl?: string): MapNode[] {
  const nodes = new Map(entries.map((e) => [e.url, { entry: e, children: [] as MapNode[] }]));
  const roots: MapNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.entry.parent ? nodes.get(n.entry.parent) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const sort = (list: MapNode[]) => {
    list.sort((a, b) => pathOf(a.entry.url).localeCompare(pathOf(b.entry.url)));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  if (startUrl) roots.sort((a, b) => (a.entry.url === startUrl ? -1 : b.entry.url === startUrl ? 1 : 0));
  return roots;
}

export function linkedFrom(entries: ManifestEntry[], url: string, limit = 100): string[] {
  return entries.filter((e) => e.links?.includes(url)).slice(0, limit).map((e) => e.url);
}

// ---------- search ----------
export interface SearchHit { url: string; title?: string | null; score: number; matches: number; snippet: string }

// Every word must appear (case-insensitive); "quoted phrases" must appear as written. Title matches count extra.
export function searchCorpus(rows: CorpusRow[], query: string, limit = 50): SearchHit[] {
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase().trim()).filter(Boolean);
  const words = query.replace(/"[^"]*"/g, ' ').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const terms = [...phrases, ...words];
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const text = row.text.toLowerCase();
    const title = (row.title ?? '').toLowerCase();
    let matches = 0;
    let first = -1;
    let all = true;
    for (const t of terms) {
      let n = 0;
      for (let i = text.indexOf(t); i !== -1 && n < 1000; i = text.indexOf(t, i + t.length)) {
        if (first === -1 || i < first) first = i;
        n++;
      }
      if (n === 0 && !title.includes(t) && !row.url.toLowerCase().includes(t)) { all = false; break; }
      matches += n;
    }
    if (!all) continue;
    const titleHits = terms.filter((t) => title.includes(t)).length;
    const start = Math.max(0, first - 100);
    const snippet = first === -1 ? row.text.slice(0, 200) : `${start > 0 ? '…' : ''}${row.text.slice(start, first + 200).replace(/\s+/g, ' ')}…`;
    hits.push({ url: row.url, title: row.title, matches, score: matches + titleHits * 20, snippet });
  }
  return hits.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, limit);
}
