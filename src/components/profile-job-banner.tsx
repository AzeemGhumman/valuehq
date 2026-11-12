import Link from 'next/link';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { jobs as jobsConfig } from '@config/jobs';
import { PROFILE_AUTHOR } from '@/jobs/steps';
import { fieldLabels, isProfileJob, isRunning, pagesSoFar } from '@/lib/job-view';
import type { Company, Job } from '@/server/types';
import { AutoRefresh } from './auto-refresh';

const DAYS_SHOWN_AFTER_A_PROBLEM = 14;

// Shown on Home and My company about the latest profile job (website crawl + summary):
//   running             blue    "We're building your company profile" with pages read so far
//   finished, drafted   purple  "We drafted parts of your company profile" until someone edits and saves it
//   problem, no draft   amber   "We couldn't read your website this time" for 14 days, or until it's fixed
// Customers never see technical detail here; operators find it in the admin console.
export function ProfileJobBanner({ jobs, company, linkToCompany = true }: { jobs: Job[]; company: Company | null; linkToCompany?: boolean }) {
  const job = jobs.find(isProfileJob);
  if (!job) return null;

  if (isRunning(job)) {
    const pages = pagesSoFar(job.steps[0]?.detail);
    const summarizing = job.jobType === 'ingest-website' && job.steps[1]?.status === 'running';
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <AutoRefresh active ms={jobsConfig.pollMs} />
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span className="flex-1"><strong>We’re building your company profile.</strong>{' '}
          {job.jobType === 'ingest-website'
            ? summarizing ? 'We’ve read your website and are summarizing what you do and how you price.'
              : `Reading your website${pages ? ` (${pages} pages so far)` : ''}. Large sites can take a while; you can keep working.`
            : `Reading ${job.totalCount} source${job.totalCount === 1 ? '' : 's'} (${job.doneCount} done). Fields fill in as we go.`}
        </span>
        <Link href="/jobs" className="font-medium underline underline-offset-2">See progress</Link>
      </div>
    );
  }

  const drafted = company?.updatedBy === PROFILE_AUTHOR;
  const problem = job.status === 'failed' || job.status === 'needs-help';
  if (drafted) {
    const filled = job.analysis?.filled?.length ? fieldLabels(job.analysis.filled).join(', ') : null;
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <Sparkles className="size-4 shrink-0" />
        <span className="flex-1"><strong>We drafted parts of your company profile from your website.</strong>{' '}
          {filled ? `We filled in: ${filled}. ` : ''}Check it and save to make it yours.</span>
        {linkToCompany && <Link href="/company" className="font-medium underline underline-offset-2">Review profile</Link>}
      </div>
    );
  }
  const finished = new Date(job.finishedAt ?? job.updatedAt).getTime();
  if (problem && Date.now() - finished < DAYS_SHOWN_AFTER_A_PROBLEM * 86_400_000) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertCircle className="size-4 shrink-0" />
        <span className="flex-1"><strong>We couldn’t read your website this time.</strong> Our team can see this and will follow up; there’s nothing you need to do. You can fill in your company profile yourself in the meantime.</span>
        {linkToCompany && <Link href="/company" className="font-medium underline underline-offset-2">Open profile</Link>}
      </div>
    );
  }
  return null;
}
