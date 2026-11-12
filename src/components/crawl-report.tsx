import type { AnalysisSummary, CrawlReport } from '@/server/types';
import { Badge } from '@/components/ui/badge';

// What the workers report about a website crawl and the Claude summary (job.report / job.analysis).
const REASONS: Record<string, string> = {
  timeout: 'No response in time', connection: 'Connection failed', dns: 'Address not found', robots: 'Blocked by robots.txt',
  'too-large': 'File too large', 'unsupported-type': 'Not a page or document', offsite: 'Redirected to another site',
  'page-limit': 'Over the page limit', 'too-deep': 'Too many clicks from the start', excluded: 'Excluded path',
  'not-included': 'Outside the include rules', 'out-of-scope': 'Outside the refreshed paths', 'other-site': 'Another website',
  'file-type': 'Images, media and code', 'not-web': 'Email, phone and other links', ignored: 'Ignored',
};
const reason = (r: string) => REASONS[r] ?? (r.startsWith('http-') ? `HTTP ${r.slice(5)}` : r);
const duration = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export function CrawlReportView({ report, analysis, showLocation = false }: { report?: CrawlReport; analysis?: AnalysisSummary; showLocation?: boolean }) {
  if (!report && !analysis) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              [report.pages, 'pages'], [report.files, 'files'], [report.unchanged, 'unchanged'],
              [report.failed, 'failed'], [`${Math.round(report.successRate * 100)}%`, 'success'],
            ].map(([n, label]) => (
              <div key={label as string}><div className="text-lg font-semibold tabular-nums">{n}</div><div className="text-muted-foreground text-xs">{label}</div></div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {report.mode === 'partial' ? `Partial re-crawl · ${report.carried} pages carried over from the last crawl` : 'Full crawl'}
            {' · '}{duration(report.durationSeconds)}{report.pageLimitReached ? ` · stopped at the ${report.pageLimit}-page limit` : ''} · crawl {report.crawlId}
          </p>
          {Object.keys(report.failuresByReason).length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Why {report.failed} {report.failed === 1 ? 'page' : 'pages'} failed</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(report.failuresByReason).map(([r, n]) => <Badge key={r} variant="warning">{reason(r)}: {n}</Badge>)}
              </div>
              <ul className="text-muted-foreground mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
                {report.failures.map((f) => (
                  <li key={f.url} className="flex justify-between gap-3"><span className="truncate">{f.url}</span><span className="shrink-0">{reason(f.reason)}{f.attempts ? ` · ${f.attempts} tries` : ''}</span></li>
                ))}
              </ul>
            </details>
          )}
          {Object.keys(report.skippedByReason).length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Links not followed</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(report.skippedByReason).map(([r, n]) => <Badge key={r} variant="secondary">{reason(r)}: {n}</Badge>)}
              </div>
            </details>
          )}
          {showLocation && <p className="text-muted-foreground text-xs break-all">Stored at {report.location}</p>}
        </>
      )}
      {analysis && (
        <div className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
          <p><span className="font-medium">Claude summary</span><span className="text-muted-foreground"> · {analysis.pages} pages read · prompt {analysis.promptVersion} · {analysis.model}</span></p>
          <p className="text-muted-foreground text-xs">
            Pricing model: {analysis.pricingModel ?? 'unknown'} · filled {analysis.filled.length ? analysis.filled.join(', ') : 'no empty fields'}
            {' · '}{analysis.inputTokens.toLocaleString()} input / {analysis.outputTokens.toLocaleString()} output tokens
          </p>
          {analysis.gaps.length > 0 && <p className="text-muted-foreground text-xs">Couldn’t find: {analysis.gaps.join('; ')}</p>}
          {showLocation && <p className="text-muted-foreground text-xs break-all">Stored at {analysis.location}</p>}
        </div>
      )}
    </div>
  );
}
