// The steps of the source jobs ("Check sources" and "Build company profile"). Shared by the Step Functions
// Lambda (src/jobs/handler.ts) and the local runner used by `npm run dev` (src/server/jobs.ts).
import { jobs as jobsConfig } from '@config/jobs';
import { company, jobsRepo, sources, workspaces } from '@/server/repo';
import type { Company, OwnerType } from '@/server/types';

export interface JobRef { workspaceId: string; jobId: string }
// extract: also read the page's title, description and opening text (build-profile jobs).
export interface SourceTask { index: number; id: string; ownerType: OwnerType; ownerId: string; label: string; url: string; extract?: boolean }
export interface PageFacts { title?: string; siteName?: string; description?: string; heading?: string; snippet?: string }
export interface CheckResult { index: number; ok: boolean; needsHelp: boolean; detail: string; url?: string; page?: PageFacts }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Who the drafted company fields are attributed to.
export const PROFILE_AUTHOR = 'ValueHQ';

export async function start({ workspaceId, jobId }: JobRef) {
  await jobsRepo.patch(workspaceId, jobId, { status: 'running' });
}

// ---------- reading a page ----------
const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();
const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function meta(html: string, key: string) {
  for (const re of [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, 'i'),
  ]) {
    const m = html.match(re);
    if (m?.[1]) return decode(m[1]);
  }
  return undefined;
}

// Pulls the basics out of an HTML page. Plain parsing for now; the AI step will read the full text later.
export function readPage(html: string): PageFacts {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ');
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')))
    .filter((p) => p.length >= 60);
  return {
    title: clip(title ? decode(title.replace(/<[^>]+>/g, ' ')) : undefined, 160),
    siteName: clip(meta(body, 'og:site_name'), 80),
    description: clip(meta(body, 'description') ?? meta(body, 'og:description') ?? meta(body, 'twitter:description'), 400),
    heading: clip(h1 ? decode(h1.replace(/<[^>]+>/g, ' ')) : undefined, 160),
    snippet: clip(paragraphs.slice(0, 2).join(' '), 600),
  };
}

// Checks that a source link responds (and, for profile jobs, reads the page).
export async function checkSource({ workspaceId, jobId }: JobRef, s: SourceTask): Promise<CheckResult> {
  await jobsRepo.setStep(workspaceId, jobId, s.index, { status: 'running', detail: s.extract ? 'Reading the page' : 'Checking the link' });
  await sleep(jobsConfig.demoStepDelayMs);

  let ok = false;
  let needsHelp = false;
  let detail: string;
  let page: PageFacts | undefined;
  try {
    const res = await fetch(s.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(jobsConfig.fetchTimeoutMs), headers: { 'user-agent': 'ValueHQ source check', accept: 'text/html,*/*' } });
    if (res.ok) {
      ok = true;
      detail = `Reachable (${res.status})`;
      if (s.extract && (res.headers.get('content-type') ?? '').includes('html')) {
        page = readPage((await res.text()).slice(0, 800_000));
        detail = page.title ? `Read “${clip(page.title, 70)}”` : 'Read the page (no title found)';
      }
    } else if ([401, 403, 429].includes(res.status)) { needsHelp = true; detail = `Blocked (${res.status}). Upload the document instead.`; }
    else { needsHelp = true; detail = `The page returned ${res.status}. Check the link.`; }
  } catch (e) {
    needsHelp = true;
    detail = e instanceof Error && e.name === 'TimeoutError' ? 'No response in time. Check the link.' : 'Could not reach the link. Check it.';
  }

  await sources.setStatus(workspaceId, s, ok ? 'ready' : 'needs-help', detail).catch(() => { /* source was deleted meanwhile */ });
  await jobsRepo.setStep(workspaceId, jobId, s.index, { status: ok ? 'done' : 'needs-help', detail }, true);
  return { index: s.index, ok, needsHelp, detail, url: s.url, page };
}

// ---------- drafting the company profile ----------
// "Acme | Inventory software for distributors" → "Inventory software for distributors"
export function categoryFromTitle(title: string | undefined, companyName: string) {
  if (!title) return undefined;
  const name = companyName.toLowerCase();
  const parts = title.split(/\s*[|–—:·]\s+|\s+-\s+/).map((p) => p.trim()).filter((p) => p && p.toLowerCase() !== name && !(p.length < name.length + 4 && p.toLowerCase().includes(name)));
  const best = parts.sort((a, b) => b.length - a.length)[0];
  return best && best.length >= 8 ? clip(best, 90) : undefined;
}

const LABELS: Partial<Record<keyof Company, string>> = { website: 'Website', tagline: 'Category', whatWeDo: 'What we do', howItWorks: 'How it works' };

// Fills only empty fields, so nothing a person wrote is overwritten. Returns the labels of what it filled.
export async function draftProfile(workspaceId: string, results: CheckResult[]): Promise<string[]> {
  const read = results.filter((r) => r.page).sort((a, b) => a.index - b.index);
  const ws = await workspaces.get(workspaceId);
  const existing = await company.get(workspaceId);
  const c: Company = existing ?? { name: ws?.name ?? 'Company' };
  const first = read[0]?.page;
  const description = read.map((r) => r.page!.description).find(Boolean);
  const snippet = read.map((r) => r.page!.snippet).find(Boolean);
  const draft: Partial<Company> = {
    website: results.find((r) => r.ok)?.url,
    tagline: categoryFromTitle(first?.title, c.name) ?? clip(first?.heading, 90),
    whatWeDo: description ?? snippet,
    howItWorks: description && snippet && snippet !== description ? snippet : undefined,
  };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(draft) as [keyof Company, string | undefined][]) {
    if (v && !c[k]) { (c as unknown as Record<string, string>)[k] = v; filled.push(LABELS[k] ?? k); }
  }
  if (filled.length) await company.put(workspaceId, { ...c, createdBy: c.createdBy ?? PROFILE_AUTHOR, updatedBy: PROFILE_AUTHOR });
  return filled;
}

export async function finish({ workspaceId, jobId }: JobRef, results: CheckResult[]) {
  const help = results.filter((r) => r.needsHelp).length;
  const job = await jobsRepo.get(workspaceId, jobId);
  const summaryIndex = (job?.steps.length ?? 1) - 1;
  let detail = help ? `${results.length - help} of ${results.length} sources reachable · ${help} need your help` : `All ${results.length} sources reachable`;
  if (job?.jobType === 'build-profile') {
    const filled = await draftProfile(workspaceId, results);
    detail = filled.length
      ? `Drafted ${filled.join(', ')} from ${results.filter((r) => r.page).length} page(s). Review them in My company.`
      : results.some((r) => r.page) ? 'Read the pages; the profile already had those fields, so nothing changed.' : 'Couldn’t read any page. Add sources or fill the profile by hand.';
    if (help) detail += ` ${help} source(s) need your help.`;
  }
  await jobsRepo.setStep(workspaceId, jobId, summaryIndex, { status: 'done', detail });
  await jobsRepo.patch(workspaceId, jobId, { status: help ? 'needs-help' : 'done', finishedAt: new Date().toISOString() });
}

export async function fail({ workspaceId, jobId }: JobRef, error: unknown) {
  const message = typeof error === 'object' && error && 'Cause' in error ? String((error as { Cause: unknown }).Cause).slice(0, 300) : String(error ?? 'Unknown error').slice(0, 300);
  await jobsRepo.patch(workspaceId, jobId, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
}
