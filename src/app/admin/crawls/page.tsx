import Link from 'next/link';
import { requireOperator } from '@/server/auth';
import { jobsRepo, workspaces } from '@/server/repo';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

export const metadata = { title: 'All crawls' };
export const dynamic = 'force-dynamic';

const FILTERS = [['all', 'All'], ['running', 'Running'], ['problems', 'Needs attention'], ['done', 'Done']] as const;

// Every website crawl across all orgs, newest first.
export default async function AllCrawls({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOperator();
  const { show = 'all' } = await searchParams;
  const orgs = (await workspaces.list()).filter((w) => w.kind !== 'internal');
  const rows = (await Promise.all(orgs.map(async (w) => (await jobsRepo.list(w.id)).filter((j) => j.jobType === 'ingest-website').map((j) => ({ w, j })))))
    .flat()
    .filter(({ j }) => show === 'all'
      || (show === 'running' && (j.status === 'queued' || j.status === 'running'))
      || (show === 'problems' && (j.status === 'failed' || j.status === 'needs-help'))
      || (show === 'done' && j.status === 'done'))
    .sort((a, b) => b.j.createdAt.localeCompare(a.j.createdAt))
    .slice(0, 200);

  return (
    <>
      <PageHeader title="All crawls" description="Website crawls across every org, newest first (up to 200)." />
      <nav className="flex gap-1 border-b">
        {FILTERS.map(([k, label]) => <Link key={k} href={`/admin/crawls?show=${k}`} className={cn('-mb-px border-b-2 px-3 py-2 text-sm', show === k ? 'border-primary font-semibold' : 'text-muted-foreground border-transparent')}>{label}</Link>)}
      </nav>
      <Card>
        <CardHeader><CardTitle>{rows.length} crawl{rows.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? <p className="text-muted-foreground text-sm">Nothing here.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Org</TableHead><TableHead>Crawl</TableHead><TableHead>Started</TableHead><TableHead className="text-right">Pages</TableHead><TableHead className="text-right">Success</TableHead><TableHead className="text-right">Time</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(({ w, j }) => {
                  const r = j.report;
                  const explorer = r ? `/admin/orgs/${w.id}/crawls/${encodeURIComponent(r.host)}/${encodeURIComponent(r.crawlId)}` : `/admin/orgs/${w.id}`;
                  return (
                    <TableRow key={`${w.id}-${j.id}`}>
                      <TableCell><Link href={`/admin/orgs/${w.id}`} className="hover:underline">{w.name}</Link></TableCell>
                      <TableCell><Link href={explorer} className="font-medium hover:underline">{j.title}</Link>{j.status === 'running' && j.steps[0]?.detail && <div className="text-muted-foreground text-xs">{j.steps[0].detail}</div>}</TableCell>
                      <TableCell className="text-sm">{timeAgo(j.createdAt)}<div className="text-muted-foreground text-xs">{j.createdBy}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{r ? r.pages + r.files : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r ? `${Math.round(r.successRate * 100)}%` : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r ? `${Math.max(1, Math.round(r.durationSeconds / 60))} min` : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.analysis ? (j.analysis.inputTokens + j.analysis.outputTokens).toLocaleString() : '–'}</TableCell>
                      <TableCell><JobBadge status={j.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
