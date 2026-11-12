import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/server/auth';
import { crawlsOf, sitesOf } from '@/server/crawl-data';
import { jobsRepo, workspaces } from '@/server/repo';
import { storageAvailable, storageLabel } from '@/server/storage';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Crawls' };
export const dynamic = 'force-dynamic';

// Every stored crawl of an org's sites (from the data bucket), with the job that produced it when known.
export default async function OrgCrawls({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;
  const w = await workspaces.get(id);
  if (!w) notFound();
  const jobs = (await jobsRepo.list(id)).filter((j) => j.jobType === 'ingest-website');
  const byCrawl = new Map(jobs.filter((j) => j.report?.crawlId).map((j) => [`${j.report!.host}/${j.report!.crawlId}`, j]));
  const running = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const sites = storageAvailable() ? await sitesOf(id) : [];
  const crawls = await Promise.all(sites.map(async (host) => ({ host, ids: await crawlsOf(id, host) })));

  return (
    <>
      <PageHeader eyebrow={<Link href={`/admin/orgs/${id}`} className="hover:underline">{w.name}</Link>} title="Crawls" description={`Everything stored for this org in ${storageLabel()}. Open a crawl to browse its pages, links, text and errors.`} />
      {running.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Running now</CardTitle></CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {running.map((j) => <div key={j.id} className="flex items-center justify-between gap-3 py-2"><span>{j.title} · {j.steps[0]?.detail ?? 'starting'}</span><JobBadge status={j.status} /></div>)}
          </CardContent>
        </Card>
      )}
      {!storageAvailable() && <Card><CardContent className="text-sm">The app can’t read crawl data here. Set <code>DATA_DIR</code> locally (README, “Crawl explorer”).</CardContent></Card>}
      {storageAvailable() && crawls.length === 0 && <Card><CardContent className="text-muted-foreground text-sm">No crawls stored yet.</CardContent></Card>}
      {crawls.map(({ host, ids }) => (
        <Card key={host}>
          <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>{host}</CardTitle><CardDescription>{ids.length} crawl{ids.length === 1 ? '' : 's'}, newest first</CardDescription></div></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Crawl</TableHead><TableHead>Kind</TableHead><TableHead className="text-right">Pages</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Success</TableHead><TableHead className="text-right">Time</TableHead><TableHead>Started by</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {ids.map((cid) => {
                  const j = byCrawl.get(`${host}/${cid}`);
                  const r = j?.report;
                  return (
                    <TableRow key={cid}>
                      <TableCell><Link href={`/admin/orgs/${id}/crawls/${encodeURIComponent(host)}/${encodeURIComponent(cid)}`} className="font-medium hover:underline">{cid}</Link>{j?.finishedAt && <div className="text-muted-foreground text-xs">{timeAgo(j.finishedAt)}</div>}</TableCell>
                      <TableCell className="text-sm">{r ? (r.mode === 'partial' ? 'partial' : 'full') : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r ? r.pages + r.files : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r?.failed ?? '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r ? `${Math.round(r.successRate * 100)}%` : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r ? `${Math.max(1, Math.round(r.durationSeconds / 60))} min` : '–'}</TableCell>
                      <TableCell className="text-sm">{j?.createdBy ?? 'command line'}</TableCell>
                      <TableCell>{j ? <JobBadge status={j.status} /> : '–'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
