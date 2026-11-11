import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { jobs as jobsConfig } from '@config/jobs';
import { ROLES } from '@config/roles';
import { pageContext } from '@/server/context';
import { accounts, jobsRepo, sources, users } from '@/server/repo';
import { assignAccount, checkAccountSources, deleteAccount, updateAccount } from '@/server/actions';
import { STAGES } from '@/lib/labels';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { AccountFields } from '@/components/account-fields';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';
import { SourcesCard } from '@/components/sources-card';
import { ViewOnly } from '@/components/view-only';

// Tabs from the design. Only Overview is built; the rest show where features will go.
const TABS = ['Overview', 'Ask', 'Brief', 'POV Deck', 'Stakeholders', 'Outreach'];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { user, workspace, canOn } = await pageContext();
  const { id } = await params;
  const { saved, error, need } = await searchParams;
  const a = await accounts.get(workspace.id, id);
  if (!a) notFound();
  const [items, allJobs, members] = await Promise.all([sources.list(workspace.id, 'account', a.id), jobsRepo.list(workspace.id), users.list(workspace.id)]);
  const jobs = allJobs.filter((j) => j.accountId === a.id).slice(0, 3);
  const running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const path = `/accounts/${a.id}`;
  const nameOf = (email?: string) => members.find((m) => m.email === email)?.name ?? email ?? 'No owner';
  const canEdit = canOn('accounts.edit', a);
  const canAssign = canOn('accounts.assign', a);
  const canDelete = canOn('accounts.delete', a);
  const canRun = canOn('jobs.run', a);
  const team = a.teamEmails ?? [];

  return (
    <>
      <AutoRefresh active={running} ms={jobsConfig.pollMs} />
      <PageHeader
        eyebrow={a.unit ? `${a.name} › ${a.unit}` : a.industry}
        title={a.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={a.priority === 'P1' ? 'success' : a.priority === 'P2' ? 'info' : 'secondary'}>{a.priority}</Badge>
            {STAGES[a.stage]}{a.ticker && <> · {a.ticker}</>}
            <> · Owner: {a.ownerEmail === user.email ? 'You' : nameOf(a.ownerEmail)}</>
            {team.length > 0 && <> · Team: {team.map(nameOf).join(', ')}</>}
          </span>
        }
      />
      <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Account sections">
        {TABS.map((t, i) => (
          <span key={t} className={i === 0 ? 'border-primary border-b-2 pb-2.5 text-sm font-semibold' : 'cursor-default pb-2.5 text-sm text-slate-400'} title={i === 0 ? undefined : 'Not built yet'}>{t}</span>
        ))}
      </nav>
      <Flash saved={saved} error={error} need={need} />

      <SourcesCard
        ownerType="account" ownerId={a.id} items={items} returnTo={path} canEdit={canEdit}
        action={canRun ? <form action={checkAccountSources}><input type="hidden" name="accountId" value={a.id} /><Button type="submit" variant="outline" size="sm" disabled={running}><RefreshCw className={running ? 'animate-spin' : ''} />{running ? 'Checking…' : 'Check sources'}</Button></form> : undefined}
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
        <CardHeader>
          <div className="flex flex-col gap-1.5"><CardTitle>Owner and team</CardTitle><CardDescription>Members can act on accounts they own or are on the team of, depending on the role rules.</CardDescription></div>
          {!canAssign && <ViewOnly what="change this account’s owner or team" />}
        </CardHeader>
        <CardContent>
          <form action={assignAccount}>
            <fieldset disabled={!canAssign} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={a.id} />
              <Field label="Owner">
                <NativeSelect name="ownerEmail" defaultValue={a.ownerEmail ?? ''}>
                  <option value="">No owner</option>
                  {members.map((m) => <option key={m.email} value={m.email}>{m.name} ({ROLES[m.role]?.label ?? m.role})</option>)}
                </NativeSelect>
              </Field>
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                <span>Team</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2 font-normal">
                  {members.map((m) => (
                    <label key={m.email} className="flex items-center gap-2"><input type="checkbox" name="teamEmails" value={m.email} defaultChecked={team.includes(m.email)} className="accent-primary size-4" />{m.name}</label>
                  ))}
                </div>
              </div>
              {canAssign && <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="outline">Save owner and team</Button></div>}
            </fieldset>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5"><CardTitle>Account details</CardTitle>{a.updatedBy && <CardDescription>Last edited by {nameOf(a.updatedBy)} · {timeAgo(a.updatedAt)}</CardDescription>}</div>
          {!canEdit && <ViewOnly what="edit this account" />}
        </CardHeader>
        <CardContent>
          <form action={updateAccount}>
            <fieldset disabled={!canEdit} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={a.id} />
              <AccountFields a={a} />
              {canEdit && <div className="flex justify-end"><Button type="submit">Save</Button></div>}
            </fieldset>
          </form>
        </CardContent>
      </Card>

      {canDelete && (
        <Card className="border-red-200">
          <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Delete account</CardTitle><CardDescription>Removes {a.name} and its sources for everyone in the workspace.</CardDescription></div></CardHeader>
          <CardContent>
            <form id="delete-account" action={deleteAccount}><input type="hidden" name="id" value={a.id} /></form>
            <ConfirmSubmit formId="delete-account" title={`Delete ${a.name}?`} description="Its sources are deleted too. This can’t be undone." variant="destructive">Delete account</ConfirmSubmit>
          </CardContent>
        </Card>
      )}
    </>
  );
}
