import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { pageContext } from '@/server/context';
import { accounts, company, jobsRepo, offerings, sources } from '@/server/repo';
import { STAGES } from '@/lib/labels';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';
import { ProfileJobBanner } from '@/components/profile-job-banner';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  const { user, workspace, caps } = await pageContext();
  const [c, offs, accts, srcs, jobs] = await Promise.all([
    company.get(workspace.id), offerings.list(workspace.id), accounts.list(workspace.id), sources.listAll(workspace.id), jobsRepo.list(workspace.id),
  ]);
  const steps = [
    { done: !!(c?.whatWeDo && c?.whoWeSellTo), title: 'Tell us about your company', detail: c ? [c.name, c.website].filter(Boolean).join(' · ') : 'What you sell and who you sell to', href: '/company', cta: 'Open' },
    { done: offs.length > 0, title: 'Add an offering', detail: offs.length ? offs.map((o) => o.name).join(', ') : 'One per product you sell', href: offs[0] ? `/offerings/${offs[0].id}` : '/offerings/new', cta: offs.length ? 'Open' : 'Add offering' },
    { done: accts.length > 0, title: 'Add your first account', detail: accts.length ? `${accts.length} accounts` : 'A company you sell to', href: accts.length ? '/accounts' : '/accounts/new', cta: accts.length ? 'Open' : 'Add account' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const rowsToReview = offs.reduce((n, o) => n + o.valueRows.filter((r) => r.status === 'drafted').length, 0);
  const needsHelp = srcs.filter((s) => s.status === 'needs-help').length;
  const stats = [
    { n: accts.length, label: 'accounts' }, { n: offs.length, label: 'offerings' },
    { n: rowsToReview, label: 'value-map rows to review' }, { n: needsHelp, label: 'sources need your help' },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} description={`${workspace.name} workspace`} />
      <ProfileJobBanner jobs={jobs} company={c} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 py-4"><CardContent><div className="text-2xl font-semibold tabular-nums">{s.n}</div><div className="text-muted-foreground text-sm">{s.label}</div></CardContent></Card>
        ))}
      </div>

      {doneCount < steps.length && (
        <Card>
          <CardHeader><CardTitle>Getting started</CardTitle><CardDescription>{doneCount} of {steps.length} done</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${s.done ? 'bg-emerald-50 text-emerald-700' : 'bg-primary text-primary-foreground'}`}>{s.done ? <Check className="size-4" /> : i + 1}</span>
                <div className="min-w-0 flex-1"><div className="font-medium">{s.title}</div><div className="text-muted-foreground text-sm">{s.detail}</div></div>
                <Button asChild variant={s.done ? 'outline' : 'default'} size="sm"><Link href={s.href}>{s.cta}</Link></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          {caps['accounts.create'] && <Button asChild size="sm"><Link href="/accounts/new"><Plus />Add account</Link></Button>}
        </CardHeader>
        <CardContent>
          {accts.length === 0 ? <p className="text-muted-foreground text-sm">No accounts yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Unit</TableHead><TableHead>Priority</TableHead><TableHead>Stage</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {accts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Link href={`/accounts/${a.id}`} className="font-medium hover:underline">{a.name}</Link></TableCell>
                    <TableCell className="text-muted-foreground">{a.unit ?? 'Whole company'}</TableCell>
                    <TableCell><Badge variant={a.priority === 'P1' ? 'success' : a.priority === 'P2' ? 'info' : 'secondary'}>{a.priority}</Badge></TableCell>
                    <TableCell>{STAGES[a.stage]}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(a.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent background jobs</CardTitle><Button asChild variant="outline" size="sm"><Link href="/jobs">All jobs</Link></Button></CardHeader>
          <CardContent className="flex flex-col divide-y">
            {jobs.slice(0, 3).map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="truncate">{j.title}</span>
                <span className="flex items-center gap-3"><span className="text-muted-foreground">{timeAgo(j.updatedAt)}</span><JobBadge status={j.status} /></span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
