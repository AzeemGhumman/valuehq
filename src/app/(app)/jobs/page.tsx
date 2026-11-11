import Link from 'next/link';
import { jobs as jobsConfig } from '@config/jobs';
import { aws } from '@config/aws';
import { requireUser } from '@/server/auth';
import { jobsRepo } from '@/server/repo';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AutoRefresh } from '@/components/auto-refresh';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Background jobs' };

const consoleLink = (arn: string) => `https://${aws.region}.console.aws.amazon.com/states/home?region=${aws.region}#/v2/executions/details/${encodeURIComponent(arn)}`;

export default async function JobsPage() {
  const { workspace } = await requireUser();
  const list = await jobsRepo.list(workspace.id);
  const active = list.some((j) => j.status === 'queued' || j.status === 'running');

  return (
    <>
      <AutoRefresh active={active} ms={jobsConfig.pollMs} />
      <PageHeader title="Background jobs" description="Work ValueHQ does for you in the background. You can leave this page; jobs keep running." />
      {list.length === 0 && (
        <Card><CardContent><p className="text-muted-foreground text-sm">No jobs yet. Open an account and select <strong>Check sources</strong> to start one.</p></CardContent></Card>
      )}
      {list.map((j) => {
        const pct = j.totalCount ? Math.round((j.doneCount / j.totalCount) * 100) : 0;
        return (
          <Card key={j.id} id={j.id}>
            <CardHeader>
              <div className="flex flex-col gap-1.5">
                <CardTitle>{j.title}</CardTitle>
                <CardDescription>Started {timeAgo(j.createdAt)} by {j.createdBy}{j.finishedAt ? ` · finished ${timeAgo(j.finishedAt)}` : ''}</CardDescription>
              </div>
              <JobBadge status={j.status} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full"><div className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} /></div>
                <span className="text-muted-foreground tabular-nums">{j.doneCount} of {j.totalCount}</span>
              </div>
              <ol className="flex flex-col divide-y rounded-lg border">
                {j.steps.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="font-medium">{s.name}</span>{s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}</span>
                    <JobBadge status={s.status} />
                  </li>
                ))}
              </ol>
              {j.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{j.error}</p>}
              <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                {j.accountId && <Link href={`/accounts/${j.accountId}`} className="hover:text-foreground underline">Open account</Link>}
                {j.jobType === 'build-profile' && <Link href="/company" className="hover:text-foreground underline">Open company profile</Link>}
                {j.executionArn && <a href={consoleLink(j.executionArn)} target="_blank" rel="noreferrer" className="hover:text-foreground underline">Open in Step Functions</a>}
                <span>Job {j.id}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
