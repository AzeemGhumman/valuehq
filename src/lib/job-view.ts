// How background jobs look to customers. Website crawls are run by the ValueHQ team (operators), so
// customers get plain progress and a calm message when something goes wrong; operators see everything
// (steps' technical detail, the crawl report, errors) on the Background jobs page and in the admin console.
import type { Job, JobStatus, StepStatus } from '@/server/types';

export const isProfileJob = (j: Job) => j.jobType === 'build-profile' || j.jobType === 'ingest-website';
export const isRunning = (j: Pick<Job, 'status'>) => j.status === 'queued' || j.status === 'running';
const DAY = 86_400_000;

// Jobs worth a badge in the sidebar: running ones, and ones that hit a problem in the last 3 days.
export function needsAttention(j: Job, now = Date.now()) {
  if (isRunning(j)) return true;
  if (j.status !== 'needs-help' && j.status !== 'failed') return false;
  return now - new Date(j.finishedAt ?? j.updatedAt).getTime() < 3 * DAY;
}

// Only website crawls are simplified: customers can't act on their details. Other jobs (Check sources)
// they start themselves and can fix, so they keep the full view.
export const simplifyFor = (j: Job, viewerIsOperator: boolean) => !viewerIsOperator && j.jobType === 'ingest-website';

export interface CustomerJobView {
  title: string;
  status: JobStatus;
  label: string;
  steps: { name: string; status: StepStatus; label: string }[];
  message?: string;
}

const STEP_NAMES = ['Reading your website', 'Summarizing what you do and how you price'];

// "212 fetched · 3 failed · ..." -> 212
export function pagesSoFar(detail?: string) {
  const m = detail?.match(/^(\d+) fetched/);
  return m ? Number(m[1]) : undefined;
}

export function customerJob(j: Job): CustomerJobView {
  const problem = j.status === 'failed' || j.status === 'needs-help';
  const summaryDone = j.steps.length > 1 && j.steps[1].status === 'done';
  // A crawl that missed some pages but still produced a summary is a success from the customer's side.
  const status: JobStatus = problem && summaryDone ? 'done' : j.status;
  const label = { queued: 'Starting', running: 'In progress', done: 'Done', 'needs-help': 'Our team is on it', failed: 'Our team is on it' }[status];
  const steps = j.steps.map((s, i) => {
    const stepProblem = s.status === 'failed' || s.status === 'needs-help';
    const pages = s.status === 'running' && i === 0 ? pagesSoFar(s.detail) : undefined;
    return {
      name: (STEP_NAMES[i] ?? s.name) + (pages ? ` · ${pages} pages so far` : ''),
      status: (stepProblem && summaryDone ? 'done' : stepProblem ? 'needs-help' : s.status) as StepStatus,
      label: stepProblem ? (summaryDone ? 'Done' : 'Our team is on it') : { waiting: 'Waiting', running: 'In progress', done: 'Done', 'needs-help': 'Our team is on it', failed: 'Our team is on it' }[s.status],
    };
  });
  const message = status === 'needs-help' || status === 'failed'
    ? 'We couldn’t read your website this time. Our team can see this and will follow up; there’s nothing you need to do. You can fill in your company profile yourself in the meantime.'
    : undefined;
  return { title: 'Reading your website', status, label, steps, message };
}

const FIELD_LABELS: Record<string, string> = {
  tagline: 'Category', whatWeDo: 'What we do', whoWeSellTo: 'Who we sell to', howItWorks: 'How it works', pricing: 'Pricing model', proof: 'Proof', website: 'Website',
};
export const fieldLabels = (fields: string[]) => fields.map((f) => FIELD_LABELS[f] ?? f);
