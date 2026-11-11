// The steps of the "Check sources" job. Shared by the Step Functions Lambda (src/jobs/handler.ts)
// and the local runner used by `npm run dev` (src/server/jobs.ts).
import { jobs as jobsConfig } from '@config/jobs';
import { jobsRepo, sources } from '@/server/repo';
import type { OwnerType } from '@/server/types';

export interface JobRef { workspaceId: string; jobId: string }
export interface SourceTask { index: number; id: string; ownerType: OwnerType; ownerId: string; label: string; url: string }
export interface CheckResult { index: number; ok: boolean; needsHelp: boolean; detail: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function start({ workspaceId, jobId }: JobRef) {
  await jobsRepo.patch(workspaceId, jobId, { status: 'running' });
}

// Checks that a source link responds. A real ingestion step would fetch and store the document here.
export async function checkSource({ workspaceId, jobId }: JobRef, s: SourceTask): Promise<CheckResult> {
  await jobsRepo.setStep(workspaceId, jobId, s.index, { status: 'running', detail: 'Checking the link' });
  await sleep(jobsConfig.demoStepDelayMs);

  let ok = false;
  let needsHelp = false;
  let detail: string;
  try {
    const res = await fetch(s.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(jobsConfig.fetchTimeoutMs), headers: { 'user-agent': 'ValueHQ source check' } });
    if (res.ok) { ok = true; detail = `Reachable (${res.status})`; }
    else if ([401, 403, 429].includes(res.status)) { needsHelp = true; detail = `Blocked (${res.status}). Upload the document instead.`; }
    else { needsHelp = true; detail = `The page returned ${res.status}. Check the link.`; }
  } catch (e) {
    needsHelp = true;
    detail = e instanceof Error && e.name === 'TimeoutError' ? 'No response in time. Check the link.' : 'Could not reach the link. Check it.';
  }

  await sources.setStatus(workspaceId, s, ok ? 'ready' : 'needs-help', detail).catch(() => { /* source was deleted meanwhile */ });
  await jobsRepo.setStep(workspaceId, jobId, s.index, { status: ok ? 'done' : 'needs-help', detail }, true);
  return { index: s.index, ok, needsHelp, detail };
}

export async function finish({ workspaceId, jobId }: JobRef, results: CheckResult[]) {
  const help = results.filter((r) => r.needsHelp).length;
  const job = await jobsRepo.get(workspaceId, jobId);
  const summaryIndex = (job?.steps.length ?? 1) - 1;
  await jobsRepo.setStep(workspaceId, jobId, summaryIndex, {
    status: 'done',
    detail: help ? `${results.length - help} of ${results.length} sources reachable · ${help} need your help` : `All ${results.length} sources reachable`,
  });
  await jobsRepo.patch(workspaceId, jobId, { status: help ? 'needs-help' : 'done', finishedAt: new Date().toISOString() });
}

export async function fail({ workspaceId, jobId }: JobRef, error: unknown) {
  const message = typeof error === 'object' && error && 'Cause' in error ? String((error as { Cause: unknown }).Cause).slice(0, 300) : String(error ?? 'Unknown error').slice(0, 300);
  await jobsRepo.patch(workspaceId, jobId, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
}
