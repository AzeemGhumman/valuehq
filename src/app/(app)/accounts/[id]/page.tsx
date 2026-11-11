import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { jobs as jobsConfig } from '@config/jobs';
import { requireUser } from '@/server/auth';
import { accounts, jobsRepo, sources } from '@/server/repo';
import { checkAccountSources, deleteAccount, updateAccount } from '@/server/actions';
import { STAGES } from '@/lib/labels';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountFields } from '@/components/account-fields';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Flash } from '@/components/flash';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';
import { SourcesCard } from '@/components/sources-card';

// Tabs from the design. Only Overview is built; the rest show where features will go.
const TABS = ['Overview', 'Ask', 'Brief', 'POV Deck', 'Stakeholders', 'Outreach'];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { workspace } = await requireUser();
  const { id } = await params;
  const { saved, error } = await searchParams;
  const a = await accounts.get(workspace.id, id);
  if (!a) notFound();
  const [items, allJobs] = await Promise.all([sources.list(workspace.id, 'account', a.id), jobsRepo.list(workspace.id)]);
  const jobs = allJobs.filter((j) => j.accountId === a.id).slice(0, 3);
  const running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const path = `/accounts/${a.id}`;

  return (
    <>
      <AutoRefresh active={running} ms={jobsConfig.pollMs} />
      <PageHeader
        eyebrow={a.unit ? `${a.name} › ${a.unit}` : a.industry}
        title={a.name}
        description={<span className="flex flex-wrap items-center gap-2"><Badge variant={a.priority === 'P1' ? 'success' : a.priority === 'P2' ? 'info' : 'secondary'}>{a.priority}</Badge>{STAGES[a.stage]}{a.ticker && <> · {a.ticker}</>}{a.domain && <> · {a.domain}</>}</span>}
      />
      <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Account sections">
        {TABS.map((t, i) => (
          <span key={t} className={i === 0 ? 'border-primary border-b-2 pb-2.5 text-sm font-semibold' : 'cursor-default pb-2.5 text-sm text-slate-400'} title={i === 0 ? undefined : 'Not built yet'}>{t}</span>
        ))}
      </nav>
      <Flash saved={saved} error={error} />

      <SourcesCard
        ownerType="account" ownerId={a.id} items={items} returnTo={path}
        action={<form action={checkAccountSources}><input type="hidden" name="accountId" value={a.id} /><Button type="submit" variant="outline" size="sm" disabled={running}><RefreshCw className={running ? 'animate-spin' : ''} />{running ? 'Checking…' : 'Check sources'}</Button></form>}
      />

      {jobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Background jobs for this account</CardTitle><Button asChild variant="outline" size="sm"><Link href="/jobs">All jobs</Link></Button></CardHeader>
          <CardContent className="flex flex-col divide-y">
            {jobs.map((j) => (
              <Link key={j.id} href={`/jobs#${j.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
                <span>{j.title} · {j.doneCount} of {j.totalCount} checked</span>
                <span className="flex items-center gap-3"><span className="text-muted-foreground">{timeAgo(j.updatedAt)}</span><JobBadge status={j.status} /></span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
        <CardContent>
          <form action={updateAccount} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={a.id} />
            <AccountFields a={a} />
            <div className="flex justify-end"><Button type="submit">Save</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Delete account</CardTitle><CardDescription>Removes {a.name} and its sources for everyone in the workspace.</CardDescription></div></CardHeader>
        <CardContent>
          <form id="delete-account" action={deleteAccount}><input type="hidden" name="id" value={a.id} /></form>
          <ConfirmSubmit formId="delete-account" title={`Delete ${a.name}?`} description="Its sources are deleted too. This can’t be undone." variant="destructive">Delete account</ConfirmSubmit>
        </CardContent>
      </Card>
    </>
  );
}
