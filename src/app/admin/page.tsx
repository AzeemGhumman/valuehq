import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireOperator } from '@/server/auth';
import { enterOrg } from '@/server/admin-actions';
import { company, jobsRepo, users, workspaces } from '@/server/repo';
import { shortDate, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flash } from '@/components/flash';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Orgs' };
export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireOperator();
  const { saved, error } = await searchParams;
  const all = await workspaces.list();
  const rows = await Promise.all(all.map(async (w) => {
    const [people, c, jobs] = await Promise.all([users.list(w.id), company.get(w.id), jobsRepo.list(w.id)]);
    const lastLogin = people.map((p) => p.lastLoginAt).filter(Boolean).sort().at(-1);
    return { w, people, c, profileJob: jobs.find((j) => j.jobType === 'build-profile'), activeJobs: jobs.filter((j) => j.status === 'running' || j.status === 'queued').length, lastLogin };
  }));
  const customers = rows.filter((r) => r.w.kind !== 'internal');
  const internal = rows.find((r) => r.w.kind === 'internal');
  const stats = [
    { n: customers.length, label: 'orgs' },
    { n: customers.filter((r) => r.w.status !== 'disabled').length, label: 'active' },
    { n: customers.reduce((n, r) => n + r.people.length, 0), label: 'people' },
    { n: rows.reduce((n, r) => n + r.activeJobs, 0), label: 'jobs running' },
  ];

  return (
    <>
      <PageHeader title="Orgs" description="Every customer workspace on this environment.">
        <Button asChild><Link href="/admin/orgs/new"><Plus />New org</Link></Button>
      </PageHeader>
      <Flash saved={saved} error={error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => <Card key={s.label} className="gap-1 py-4"><CardContent><div className="text-2xl font-semibold tabular-nums">{s.n}</div><div className="text-muted-foreground text-sm">{s.label}</div></CardContent></Card>)}
      </div>

      <Card>
        <CardHeader><CardTitle>Customer orgs</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {customers.length === 0 ? <p className="text-muted-foreground text-sm">No orgs yet. <Link href="/admin/orgs/new" className="underline">Create the first one</Link>.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Org</TableHead><TableHead>Status</TableHead><TableHead>People</TableHead><TableHead>Profile</TableHead><TableHead>Last sign-in</TableHead><TableHead>Created</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {customers.map(({ w, people, c, profileJob, lastLogin }) => (
                  <TableRow key={w.id}>
                    <TableCell><Link href={`/admin/orgs/${w.id}`} className="font-medium hover:underline">{w.name}</Link>{c?.website && <div className="text-muted-foreground text-xs">{c.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>}</TableCell>
                    <TableCell>{w.status === 'disabled' ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                    <TableCell className="tabular-nums">{people.length}</TableCell>
                    <TableCell>{profileJob ? <JobBadge status={profileJob.status} /> : <span className="text-muted-foreground text-sm">–</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{lastLogin ? timeAgo(lastLogin) : 'Never'}</TableCell>
                    <TableCell className="text-muted-foreground">{shortDate(w.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <form action={enterOrg}><input type="hidden" name="id" value={w.id} /><Button type="submit" size="sm" variant="outline">Open as admin</Button></form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {internal && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5"><CardTitle>Platform team</CardTitle><CardDescription>Operators in the {internal.w.name} workspace. They can do everything on this page.</CardDescription></div>
            <Button asChild variant="outline" size="sm"><Link href={`/admin/orgs/${internal.w.id}`}>Manage operators</Link></Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {internal.people.map((p) => <Badge key={p.email} variant="outline">{p.name} · {p.email}</Badge>)}
          </CardContent>
        </Card>
      )}
    </>
  );
}
