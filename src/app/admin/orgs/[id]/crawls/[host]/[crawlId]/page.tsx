import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, RotateCw, Search } from 'lucide-react';
import { requireOperator } from '@/server/auth';
import { rerunPages } from '@/server/admin-actions';
import { crawlDir, loadAnalysis, loadCorpus, loadCrawl, loadPageText } from '@/server/crawl-data';
import { canIngestWebsite } from '@/server/jobs';
import { jobsRepo, workspaces } from '@/server/repo';
import { storageAvailable, storageLabel, getText } from '@/server/storage';
import { folderTree, isGood, linkTree, linkedFrom, pathOf, searchCorpus, textKeyOf } from '@/lib/crawl-tree';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dot, FolderView, MapView, PageRow, STATUS, duration, ms, type Ctx } from '@/components/crawl-explorer-parts';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Crawl explorer' };
export const dynamic = 'force-dynamic';

const VIEWS = [['pages', 'Folders'], ['map', 'Link map'], ['failed', 'Failed'], ['slowest', 'Slowest'], ['search', 'Search'], ['report', 'Report']] as const;
type View = (typeof VIEWS)[number][0];
type Params = { id: string; host: string; crawlId: string };
type Query = { view?: string; page?: string; q?: string; raw?: string; saved?: string; error?: string };

export default async function CrawlExplorer({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Query> }) {
  await requireOperator();
  const [{ id, host: rawHost, crawlId: rawCrawl }, sp] = await Promise.all([params, searchParams]);
  const host = decodeURIComponent(rawHost);
  const crawlId = decodeURIComponent(rawCrawl);
  const w = await workspaces.get(id);
  if (!w) notFound();
  if (!storageAvailable()) {
    return <><PageHeader title="Crawl explorer" /><Card><CardContent className="text-sm">The app can’t read crawl data here. Set <code>DATA_DIR</code> (local) or deploy to AWS. See the README, “Crawl explorer”.</CardContent></Card></>;
  }
  const { manifest, report, config } = await loadCrawl(id, host, crawlId);
  if (manifest.length === 0 && !report) notFound();
  const jobs = await jobsRepo.list(id);
  const job = jobs.find((j) => j.report?.crawlId === crawlId);
  const analysis = await loadAnalysis(job?.analysis?.location);
  const tokens = new Map((analysis?.pages ?? []).filter((p) => p.tokensEst != null).map((p) => [p.url, p.tokensEst!]));
  const view: View = (VIEWS.find(([v]) => v === sp.view)?.[0] ?? 'pages') as View;
  const base = `/admin/orgs/${id}/crawls/${encodeURIComponent(host)}/${encodeURIComponent(crawlId)}`;
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { view, q: sp.q, page: sp.page, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };
  const ctx: Ctx = { orgId: id, host, crawlId, href, selected: sp.page, tokens };
  const workers = canIngestWebsite();
  const failed = manifest.filter((e) => e.status === 'failed');
  const pagesOnly = manifest.filter((e) => e.status !== 'skipped');
  const selected = sp.page ? manifest.find((e) => e.url === sp.page) : undefined;
  const hidden = (<><input type="hidden" name="id" value={id} /><input type="hidden" name="host" value={host} /><input type="hidden" name="crawlId" value={crawlId} /></>);

  const stats: [string, string][] = report ? [
    [String(report.pages), 'pages'], [String(report.files), 'files'], [String(report.unchanged), 'unchanged'], [String(report.carried ?? 0), 'kept from earlier'],
    [String(report.failed), 'failed'], [`${Math.round(report.successRate * 100)}%`, 'success'], [duration(report.durationSeconds), 'total time'],
    [ms(report.fetchMs?.avg), 'average fetch'], [analysis ? `${(analysis.usage.inputTokens + analysis.usage.outputTokens).toLocaleString()}` : '–', 'Claude tokens'],
  ] : [];

  return (
    <>
      <PageHeader
        eyebrow={<><Link href={`/admin/orgs/${id}`} className="hover:underline">{w.name}</Link> · <Link href={`/admin/orgs/${id}/crawls`} className="hover:underline">Crawls</Link></>}
        title={<span className="flex flex-wrap items-center gap-3">{host}<Badge variant="secondary">{crawlId}</Badge>{report && <Badge variant={report.mode === 'partial' ? 'info' : 'secondary'}>{report.mode === 'partial' ? 'partial re-crawl' : 'full crawl'}</Badge>}</span>}
        description={report ? `Started ${timeAgo(report.startedAt)} · finished ${timeAgo(report.finishedAt)}${job ? ` · by ${job.createdBy}` : ''} · ${storageLabel()}` : 'No report for this crawl.'}
      >
        {workers && config && (
          <>
            <form action={rerunPages}>{hidden}<input type="hidden" name="mode" value="all" /><input type="hidden" name="analyze" value="on" /><Button type="submit" variant="outline"><RotateCw />Re-crawl whole site</Button></form>
            {failed.length > 0 && (
              <form action={rerunPages}>{hidden}<input type="hidden" name="mode" value="pages" />
                {failed.slice(0, 2000).map((e) => <input key={e.url} type="hidden" name="url" value={e.url} />)}
                <Button type="submit">Retry {failed.length} failed</Button>
              </form>
            )}
          </>
        )}
      </PageHeader>
      <Flash saved={sp.saved} error={sp.error} />

      {stats.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {stats.map(([n, label]) => <Card key={label} className="gap-0 py-3"><CardContent className="px-3"><div className="text-lg font-semibold tabular-nums">{n}</div><div className="text-muted-foreground text-xs">{label}</div></CardContent></Card>)}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Views">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={href({ view: v })} className={cn('-mb-px border-b-2 px-3 py-2 text-sm', v === view ? 'border-primary font-semibold' : 'text-muted-foreground border-transparent hover:text-foreground')}>
            {label}{v === 'failed' && failed.length > 0 && <span className="ml-1 rounded-full bg-red-50 px-1.5 text-xs text-red-700">{failed.length}</span>}
          </Link>
        ))}
      </nav>

      <div className={cn('grid gap-6', selected && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]')}>
        <Card className="min-w-0">
          <CardContent className="flex flex-col gap-3">
            {workers && ['pages', 'map', 'failed', 'slowest', 'search'].includes(view) && (
              <form id="selected-pages" action={rerunPages} className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                {hidden}<input type="hidden" name="mode" value="pages" />
                <span className="text-muted-foreground flex-1">Tick pages, then</span>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="analyze" className="size-3.5" />summarize again after</label>
                <Button type="submit" size="sm" variant="outline"><RotateCw />Re-crawl selected</Button>
              </form>
            )}
            <ViewBody view={view} sp={sp} ctx={ctx} manifest={pagesOnly} all={manifest} failed={failed} startUrl={config?.start_url} report={report} config={config} analysis={analysis} id={id} host={host} crawlId={crawlId} />
          </CardContent>
        </Card>

        {selected && <PageDetail e={selected} all={manifest} ctx={ctx} raw={sp.raw === '1'} workers={workers} hidden={hidden} tokens={tokens.get(selected.url)} chars={analysis?.pages.find((p) => p.url === selected.url)?.chars} />}
      </div>
    </>
  );
}

async function ViewBody({ view, sp, ctx, manifest, all, failed, startUrl, report, config, analysis, id, host, crawlId }: {
  view: View; sp: Query; ctx: Ctx; manifest: import('@/lib/crawl-tree').ManifestEntry[]; all: import('@/lib/crawl-tree').ManifestEntry[];
  failed: import('@/lib/crawl-tree').ManifestEntry[]; startUrl?: string; report: Awaited<ReturnType<typeof loadCrawl>>['report'];
  config: Awaited<ReturnType<typeof loadCrawl>>['config']; analysis: Awaited<ReturnType<typeof loadAnalysis>>; id: string; host: string; crawlId: string;
}) {
  if (view === 'pages') {
    return <><Legend /><FolderView node={folderTree(manifest)} ctx={ctx} /></>;
  }
  if (view === 'map') {
    const hasLinks = manifest.some((e) => e.parent || e.links);
    return (
      <>
        <p className="text-muted-foreground text-xs">Each page sits under the page it was first found on; → shows how many pages it led to. {hasLinks ? 'Open a page to see all its links in and out.' : 'This crawl ran before links were recorded; re-crawl to see the map.'}</p>
        <MapView nodes={linkTree(manifest, startUrl)} ctx={ctx} />
      </>
    );
  }
  if (view === 'failed') {
    if (failed.length === 0) return <p className="text-muted-foreground text-sm">No failed pages.</p>;
    return (
      <Table>
        <TableHeader><TableRow><TableHead /><TableHead>Page</TableHead><TableHead>Why</TableHead><TableHead className="text-right">Tries</TableHead></TableRow></TableHeader>
        <TableBody>
          {failed.map((e) => (
            <TableRow key={e.url}>
              <TableCell><input type="checkbox" name="url" value={e.url} form="selected-pages" className="size-3.5" aria-label={`Select ${e.url}`} /></TableCell>
              <TableCell className="max-w-72 truncate"><Link href={ctx.href({ page: e.url })} className="hover:underline" title={e.url}>{pathOf(e.url)}</Link></TableCell>
              <TableCell className="text-sm">{e.reason}{e.httpStatus ? ` (${e.httpStatus})` : ''}{e.error && <div className="text-muted-foreground max-w-80 truncate text-xs" title={e.error}>{e.error}</div>}</TableCell>
              <TableCell className="text-right tabular-nums">{e.attempts ?? '–'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  if (view === 'slowest') {
    const slow = manifest.filter((e) => e.fetchMs != null).sort((a, b) => (b.fetchMs ?? 0) - (a.fetchMs ?? 0)).slice(0, 100);
    if (slow.length === 0) return <p className="text-muted-foreground text-sm">No timings recorded for this crawl (pages kept from earlier crawls aren’t timed).</p>;
    return <><p className="text-muted-foreground text-xs">The 100 slowest downloads in this crawl. Average {ms(report?.fetchMs?.avg)}, median {ms(report?.fetchMs?.median)}.</p><ul className="flex flex-col">{slow.map((e) => <PageRow key={e.url} e={e} ctx={ctx} label={pathOf(e.url)} />)}</ul></>;
  }
  if (view === 'search') {
    const corpus = await loadCorpus(id, host, crawlId);
    const hits = corpus && sp.q ? searchCorpus(corpus, sp.q) : [];
    return (
      <>
        <form className="flex gap-2" action="">
          <input type="hidden" name="view" value="search" />
          <Input name="q" defaultValue={sp.q ?? ''} placeholder={'Words, or "an exact phrase"'} autoFocus />
          <Button type="submit"><Search />Search</Button>
        </form>
        {!corpus && <p className="text-muted-foreground text-sm">This crawl has no search file (it ran before search existed). Re-crawl to search it.</p>}
        {corpus && sp.q && <p className="text-muted-foreground text-xs">{hits.length === 50 ? '50+' : hits.length} of {corpus.length} pages match.</p>}
        <ul className="flex flex-col gap-2">
          {hits.map((h) => (
            <li key={h.url} className={cn('rounded-md border p-2 text-sm', ctx.selected === h.url && 'bg-accent')}>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="url" value={h.url} form="selected-pages" className="size-3.5" aria-label={`Select ${h.url}`} />
                <Link href={ctx.href({ page: h.url })} className="min-w-0 flex-1 truncate font-medium hover:underline">{h.title || pathOf(h.url)}</Link>
                <span className="text-muted-foreground text-xs">{h.matches} match{h.matches === 1 ? '' : 'es'}</span>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{h.snippet}</p>
            </li>
          ))}
        </ul>
      </>
    );
  }
  // report
  return (
    <div className="flex flex-col gap-4 text-sm">
      {report && (
        <>
          <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Started / finished</dt><dd>{report.startedAt} → {report.finishedAt}</dd>
            <dt className="text-muted-foreground">Total time</dt><dd>{duration(report.durationSeconds)}</dd>
            <dt className="text-muted-foreground">Fetch time</dt><dd>{report.fetchMs ? `total ${ms(report.fetchMs.total)} · average ${ms(report.fetchMs.avg)} · median ${ms(report.fetchMs.median)} · slowest ${ms(report.fetchMs.max)}` : '–'}</dd>
            <dt className="text-muted-foreground">Downloaded</dt><dd>{(report.bytesDownloaded / 1_048_576).toFixed(1)} MB · {report.newBlobs} new files stored</dd>
            <dt className="text-muted-foreground">Page limit</dt><dd>{report.pageLimit}{report.pageLimitReached ? ' (reached)' : ''}</dd>
            <dt className="text-muted-foreground">Stored at</dt><dd className="break-all">{storageLabel()}/{crawlDir(id, host, crawlId)}/</dd>
          </dl>
          {Object.keys(report.failuresByReason).length > 0 && <div><p className="mb-1 font-medium">Failures by reason</p><div className="flex flex-wrap gap-1.5">{Object.entries(report.failuresByReason).map(([r, n]) => <Badge key={r} variant="warning">{r}: {n}</Badge>)}</div></div>}
          {Object.keys(report.skippedByReason).length > 0 && (
            <div>
              <p className="mb-1 font-medium">Links not followed</p>
              <ul className="flex flex-col gap-1">{Object.entries(report.skippedByReason).map(([r, n]) => <li key={r}><Badge variant="secondary">{r}: {n}</Badge> <span className="text-muted-foreground text-xs">{(report.skippedExamples?.[r] ?? []).join(' · ')}</span></li>)}</ul>
            </div>
          )}
          <div><p className="mb-1 font-medium">Retry policy</p><pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">{JSON.stringify(report.retryPolicy, null, 2)}</pre></div>
        </>
      )}
      {analysis && (
        <div>
          <p className="mb-1 font-medium">Claude summary</p>
          <p className="text-muted-foreground">{analysis.model} · prompt {analysis.promptVersion} · {analysis.pages.length} pages read · {analysis.usage.inputTokens.toLocaleString()} input and {analysis.usage.outputTokens.toLocaleString()} output tokens. Per-page tokens are each page’s share of the input by length (one request covers all pages).</p>
        </div>
      )}
      {config && <div><p className="mb-1 font-medium">Settings</p><pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">{JSON.stringify(config, null, 2)}</pre></div>}
      <p className="text-muted-foreground text-xs">{all.length} URLs in this crawl’s manifest.</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
      {Object.entries(STATUS).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><Dot status={k} />{v.label}</span>)}
    </div>
  );
}

async function PageDetail({ e, all, ctx, raw, workers, hidden, tokens, chars }: {
  e: import('@/lib/crawl-tree').ManifestEntry; all: import('@/lib/crawl-tree').ManifestEntry[]; ctx: Ctx; raw: boolean; workers: boolean;
  hidden: React.ReactNode; tokens?: number; chars?: number;
}) {
  const textKey = textKeyOf(e);
  const rawKey = isGood(e) ? e.rawKey : e.previousRawKey;
  const [text, rawHtml] = await Promise.all([
    !raw && textKey ? loadPageText(textKey) : Promise.resolve(null),
    raw && rawKey && e.kind !== 'file' ? getText(rawKey) : Promise.resolve(null),
  ]);
  const byUrl = new Map(all.map((x) => [x.url, x]));
  const from = linkedFrom(all, e.url);
  const rows: [string, React.ReactNode][] = [
    ['Status', <span key="s" className="flex items-center gap-1.5"><Dot status={e.status} />{STATUS[e.status]?.label ?? e.status}{e.reason ? ` · ${e.reason}` : ''}</span>],
    ['HTTP', e.httpStatus ?? '–'], ['Tries', e.attempts ?? '–'], ['Fetch time', ms(e.fetchMs)], ['Processing', ms(e.processMs)],
    ['Clicks from start', e.depth ?? '–'], ['Type', e.contentType || e.kind || '–'],
    ['Size', e.bytes ? `${(e.bytes / 1024).toFixed(0)} KB` : e.chars ? `${e.chars.toLocaleString()} characters of text` : '–'],
    ['Fetched', e.fetchedAt ? `${e.fetchedAt} (${timeAgo(e.fetchedAt)})` : e.checkedAt ? `checked ${timeAgo(e.checkedAt)}` : '–'],
    ['Claude', tokens != null ? `~${tokens.toLocaleString()} input tokens (${(chars ?? 0).toLocaleString()} characters sent)` : 'not used in the summary'],
  ];
  if (e.finalUrl && e.finalUrl !== e.url) rows.push(['Redirected to', e.finalUrl]);
  if (e.error) rows.push(['Error', e.error]);
  if (e.etag) rows.push(['ETag', e.etag]);
  if (textKey) rows.push(['Stored text', textKey]);
  return (
    <Card className="min-w-0 self-start lg:sticky lg:top-4">
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle className="truncate">{e.title || pathOf(e.url)}</CardTitle>
          <CardDescription className="flex min-w-0 items-center gap-1.5"><a href={e.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{e.url}</a><ExternalLink className="size-3 shrink-0" /></CardDescription>
        </div>
        <Link href={ctx.href({ page: undefined, raw: undefined })} className="text-muted-foreground text-sm hover:underline" scroll={false}>Close</Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1">{rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></Fragment>)}</dl>
        {workers && (
          <form action={rerunPages} className="flex flex-wrap items-center gap-3">
            {hidden}<input type="hidden" name="mode" value="pages" /><input type="hidden" name="url" value={e.url} />
            <Button type="submit" size="sm" variant="outline"><RotateCw />Re-crawl this page</Button>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="analyze" className="size-3.5" />summarize again after</label>
          </form>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">Found on</p>
            {e.parent ? <Link href={ctx.href({ page: e.parent })} className="block truncate hover:underline" scroll={false}>{pathOf(e.parent)}</Link> : <p className="text-muted-foreground text-xs">Start page, sitemap or an earlier crawl</p>}
            <p className="mt-3 mb-1 font-medium">Linked from ({from.length})</p>
            <ul className="flex max-h-48 flex-col overflow-y-auto">{from.map((u) => <li key={u}><Link href={ctx.href({ page: u })} className="block truncate text-xs hover:underline" scroll={false}>{pathOf(u)}</Link></li>)}</ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Links to ({e.linkCount ?? e.links?.length ?? 0})</p>
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {(e.links ?? []).map((u) => {
                const target = byUrl.get(u);
                return <li key={u} className="flex items-center gap-1.5 text-xs">{target ? <Dot status={target.status} /> : <span className="inline-block size-2 rounded-full border" title="Not crawled" />}{target ? <Link href={ctx.href({ page: u })} className="truncate hover:underline" scroll={false}>{pathOf(u)}</Link> : <span className="text-muted-foreground truncate">{pathOf(u)}</span>}</li>;
              })}
            </ul>
          </div>
        </div>
        {e.kind !== 'file' && (textKey || rawKey) && (
          <div>
            <div className="mb-1 flex items-center gap-3">
              <p className="font-medium">{raw ? 'Original HTML' : 'Extracted text'}</p>
              <Link href={ctx.href({ raw: raw ? undefined : '1' })} className="text-muted-foreground text-xs underline" scroll={false}>{raw ? 'Show extracted text' : 'Show original HTML'}</Link>
            </div>
            <pre className="bg-muted max-h-[32rem] overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{(raw ? rawHtml : text)?.slice(0, 60_000) || 'Nothing stored for this page.'}</pre>
          </div>
        )}
        {e.kind === 'file' && <p className="text-muted-foreground text-xs">A {e.contentType || 'file'} stored at {rawKey}. Its text is extracted by the file-reading job (not built yet).</p>}
      </CardContent>
    </Card>
  );
}
