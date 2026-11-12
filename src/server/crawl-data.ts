// The workers' stored crawls, for the operator's crawl explorer. Keys mirror workers/valuehq_workers/layout.py.
import type { CorpusRow, ManifestEntry } from '@/lib/crawl-tree';
import type { CrawlOptions, CrawlReport } from './types';
import { folders, getJson, getJsonl, getText } from './storage';

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const websiteRoot = (ws: string, host: string) => `workspaces/${safe(ws)}/website/${safe(host)}`;
export const crawlDir = (ws: string, host: string, crawlId: string) => `${websiteRoot(ws, host)}/crawls/${safe(crawlId)}`;

// Full crawl report as the workers wrote it (job.report is a summary of this).
export interface FullReport extends CrawlReport {
  startUrl: string; startedAt: string; finishedAt: string; scope: string[]; urls?: number; bytesDownloaded: number; newBlobs: number;
  retryPolicy: Record<string, unknown>; fetchMs?: { total: number; avg: number; median: number; max: number } | null;
  skippedExamples: Record<string, string[]>;
}
export type CrawlConfigFile = CrawlOptions & { workspaceId: string; jobId?: string | null; previousCrawlId?: string | null } & Record<string, unknown>;

export async function sitesOf(workspaceId: string) {
  return folders(`workspaces/${safe(workspaceId)}/website/`);
}
export async function crawlsOf(workspaceId: string, host: string) {
  return (await folders(`${websiteRoot(workspaceId, host)}/crawls/`)).sort().reverse();
}

export async function loadCrawl(workspaceId: string, host: string, crawlId: string) {
  const dir = crawlDir(workspaceId, host, crawlId);
  const [manifest, report, config] = await Promise.all([
    getJsonl<ManifestEntry>(`${dir}/manifest.jsonl`),
    getJson<FullReport>(`${dir}/report.json`),
    getJson<CrawlConfigFile>(`${dir}/config.json`),
  ]);
  return { manifest, report, config };
}

// The search file can be tens of MB, so the last few are kept in memory between requests.
const corpusCache = new Map<string, CorpusRow[]>();
export async function loadCorpus(workspaceId: string, host: string, crawlId: string): Promise<CorpusRow[] | null> {
  const key = crawlDir(workspaceId, host, crawlId);
  const hit = corpusCache.get(key);
  if (hit) return hit;
  const rows = await getJsonl<CorpusRow>(`${key}/corpus.jsonl.gz`);
  if (rows.length === 0) return null; // crawls from before search existed have no corpus
  corpusCache.set(key, rows);
  if (corpusCache.size > 3) corpusCache.delete(corpusCache.keys().next().value!);
  return rows;
}

export const loadPageText = (key: string) => getText(key);

// The Claude summary that used this crawl: per-page characters sent and estimated tokens.
export interface AnalysisRecord {
  promptVersion: string; model: string; crawlId: string; usage: { inputTokens: number; outputTokens: number };
  pages: { url: string; title?: string; chars: number; score: number; tokensEst?: number }[];
}
export async function loadAnalysis(location?: string): Promise<AnalysisRecord | null> {
  if (!location) return null;
  const key = location.replace(/^s3:\/\/[^/]+\//, '');
  return getJson<AnalysisRecord>(key);
}
