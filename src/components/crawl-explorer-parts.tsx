// Pieces of the crawl explorer (src/app/admin/orgs/[id]/crawls/[host]/[crawlId]/page.tsx). Server components.
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { rerunPages } from '@/server/admin-actions';
import { pathOf, type FolderNode, type ManifestEntry, type MapNode } from '@/lib/crawl-tree';
import { cn } from '@/lib/utils';

export const STATUS: Record<string, { label: string; dot: string }> = {
  ok: { label: 'Fetched', dot: 'bg-emerald-500' },
  unchanged: { label: 'Unchanged', dot: 'bg-sky-500' },
  carried: { label: 'Kept from earlier crawl', dot: 'bg-slate-300' },
  failed: { label: 'Failed', dot: 'bg-red-500' },
  skipped: { label: 'Skipped', dot: 'bg-amber-400' },
};
export const ms = (n?: number) => (n == null ? '–' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);
export const duration = (s?: number) => (s == null ? '–' : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export function Dot({ status }: { status: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', STATUS[status]?.dot ?? 'bg-slate-300')} title={STATUS[status]?.label ?? status} />;
}

export interface Ctx { orgId: string; host: string; crawlId: string; href: (params: Record<string, string | undefined>) => string; selected?: string; tokens: Map<string, number> }

// One page in a list: checkbox (part of the "selected pages" form), status, path or title, timing.
export function PageRow({ e, ctx, label }: { e: ManifestEntry; ctx: Ctx; label?: string }) {
  const t = ctx.tokens.get(e.url);
  return (
    <li className={cn('flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted', ctx.selected === e.url && 'bg-accent')}>
      <input type="checkbox" name="url" value={e.url} form="selected-pages" className="size-3.5 shrink-0" aria-label={`Select ${e.url}`} />
      <Dot status={e.status} />
      <Link href={ctx.href({ page: e.url })} className="min-w-0 flex-1 truncate" title={e.url} scroll={false}>
        {label ?? (pathOf(e.url).split('/').filter(Boolean).at(-1) || '/')}
        {e.title && <span className="text-muted-foreground"> · {e.title}</span>}
      </Link>
      {e.kind === 'file' && <span className="text-muted-foreground text-[11px] uppercase">file</span>}
      {t != null && <span className="text-[11px] text-violet-700" title="Estimated Claude input tokens for this page">{t.toLocaleString()} tok</span>}
      <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">{ms(e.fetchMs)}</span>
    </li>
  );
}

export function FolderView({ node, ctx, depth = 0 }: { node: FolderNode; ctx: Ctx; depth?: number }) {
  const body = (
    <>
      {node.pages.length > 0 && <ul className="flex flex-col">{node.pages.map((e) => <PageRow key={e.url} e={e} ctx={ctx} label={pathOf(e.url) === node.path || pathOf(e.url) === `${node.path}/` ? `${node.name === '/' ? '/' : `${node.name}/`} (index)` : undefined} />)}</ul>}
      {node.children.map((c) => <FolderView key={c.path} node={c} ctx={ctx} depth={depth + 1} />)}
    </>
  );
  if (depth === 0) return <div className="flex flex-col">{body}</div>;
  return (
    <details open={depth < 2 && node.total <= 60} className="ml-2 border-l pl-2">
      <summary className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm font-medium hover:bg-muted">
        <span className="min-w-0 flex-1 truncate">{node.name}/</span>
        <span className="text-muted-foreground text-xs font-normal">{node.total} {node.failed > 0 && <span className="text-red-600">· {node.failed} failed</span>}</span>
        <form action={rerunPages}>
          <input type="hidden" name="id" value={ctx.orgId} /><input type="hidden" name="host" value={ctx.host} /><input type="hidden" name="crawlId" value={ctx.crawlId} />
          <input type="hidden" name="mode" value="folder" /><input type="hidden" name="folder" value={node.path} />
          <button type="submit" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-1 text-xs font-normal" title={`Re-crawl everything under ${node.path}`}><RotateCw className="size-3" />re-crawl</button>
        </form>
      </summary>
      {body}
    </details>
  );
}

export function MapView({ nodes, ctx, depth = 0 }: { nodes: MapNode[]; ctx: Ctx; depth?: number }) {
  return (
    <ul className={cn('flex flex-col', depth > 0 && 'ml-3 border-l pl-2')}>
      {nodes.map((n) => (
        <li key={n.entry.url}>
          {n.children.length === 0 ? (
            <ul><PageRow e={n.entry} ctx={ctx} label={pathOf(n.entry.url)} /></ul>
          ) : (
            <details open={depth < 1}>
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <ul><PageRow e={n.entry} ctx={ctx} label={`${pathOf(n.entry.url)}  → ${n.children.length}`} /></ul>
              </summary>
              <MapView nodes={n.children} ctx={ctx} depth={depth + 1} />
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
