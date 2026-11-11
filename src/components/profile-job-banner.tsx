import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';
import { jobs as jobsConfig } from '@config/jobs';
import { PROFILE_AUTHOR } from '@/jobs/steps';
import type { Company, Job } from '@/server/types';
import { AutoRefresh } from './auto-refresh';

// Shown on Home and My company while ValueHQ builds the company profile from its sources,
// and afterwards while drafted fields haven't been reviewed (edited by a person) yet.
export function ProfileJobBanner({ jobs, company, linkToCompany = true }: { jobs: Job[]; company: Company | null; linkToCompany?: boolean }) {
  const job = jobs.find((j) => j.jobType === 'build-profile');
  if (!job) return null;
  const active = job.status === 'queued' || job.status === 'running';
  if (active) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <AutoRefresh active ms={jobsConfig.pollMs} />
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span className="flex-1"><strong>We’re building your company profile.</strong> Reading {job.totalCount} source{job.totalCount === 1 ? '' : 's'} ({job.doneCount} done). Fields fill in as we go.</span>
        <Link href="/jobs" className="font-medium underline underline-offset-2">Follow the job</Link>
      </div>
    );
  }
  if (company?.updatedBy !== PROFILE_AUTHOR) return null; // a person has edited it since
  const summary = job.steps.at(-1)?.detail;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <Sparkles className="size-4 shrink-0" />
      <span className="flex-1"><strong>We drafted parts of your company profile from your website.</strong> {summary} Check it and save to make it yours.</span>
      {linkToCompany && <Link href="/company" className="font-medium underline underline-offset-2">Review profile</Link>}
    </div>
  );
}
