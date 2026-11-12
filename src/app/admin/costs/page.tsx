import { RefreshCw } from 'lucide-react';
import { requireOperator } from '@/server/auth';
import { refreshCosts } from '@/server/admin-actions';
import { canRefreshCosts } from '@/server/jobs';
import { costs } from '@/server/repo';
import type { CostDay, CostMonth } from '@/server/types';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Costs' };
export const dynamic = 'force-dynamic';

const usd = (n: number | null | undefined) => (n == null ? '–' : n < 10 && n !== 0 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString()}`);
const monthName = (m?: string) => (m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

// Two-column table of {label: amount} for this month and last month.
function Breakdown({ title, description, months, field }: { title: string; description?: string; months?: CostMonth[]; field: 'byService' | 'byEnv' | 'byModel' }) {
  const [now, last] = months ?? [];
  const keys = [...new Set([...Object.keys(now?.[field] ?? {}), ...Object.keys(last?.[field] ?? {})])];
  return (
    <Card>
      <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div></CardHeader>
      <CardContent>
        {keys.length === 0 ? <p className="text-muted-foreground text-sm">Nothing yet.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead /><TableHead className="text-right">{monthName(now?.month)} so far</TableHead><TableHead className="text-right">{monthName(last?.month)}</TableHead></TableRow></TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right tabular-nums">{usd(now?.[field]?.[k] ?? 0)}</TableCell><TableCell className="text-right tabular-nums">{usd(last?.[field]?.[k] ?? 0)}</TableCell></TableRow>
              ))}
              <TableRow className="font-medium"><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{usd(now?.total)}</TableCell><TableCell className="text-right tabular-nums">{usd(last?.total)}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Stacked daily bars: AWS (blue) and Anthropic (violet), last 30 days.
function DailyChart({ aws = [], anthropic = [] }: { aws?: CostDay[]; anthropic?: CostDay[] }) {
  const byDay = new Map<string, { aws: number; anthropic: number }>();
  for (const d of aws) byDay.set(d.date, { aws: d.amount, anthropic: 0 });
  for (const d of anthropic) if (byDay.has(d.date)) byDay.get(d.date)!.anthropic = d.amount;
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(0.01, ...days.map(([, v]) => v.aws + v.anthropic));
  if (days.length === 0) return <p className="text-muted-foreground text-sm">No daily data yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Daily cost, last 30 days">
        {days.map(([day, v]) => (
          <div key={day} className="flex h-full flex-1 flex-col justify-end" title={`${day}: AWS ${usd(v.aws)}, Anthropic ${usd(v.anthropic)}`}>
            <div className="rounded-t-sm bg-violet-500" style={{ height: `${(v.anthropic / max) * 100}%` }} />
            <div className="bg-primary" style={{ height: `${(v.aws / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs"><span>{days[0][0]}</span><span>max {usd(max)} a day</span><span>{days.at(-1)![0]}</span></div>
      <div className="text-muted-foreground flex gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="bg-primary size-2.5 rounded-sm" />AWS</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-violet-500" />Anthropic</span>
      </div>
    </div>
  );
}

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireOperator();
  const { saved, error } = await searchParams;
  const snap = await costs.latest();
  const canRefresh = canRefreshCosts();
  const aws = snap?.aws;
  const ant = snap?.anthropic;
  const awsNow = aws?.months?.[0];
  const antNow = ant?.months?.[0];
  const total = (awsNow?.total ?? 0) + (antNow?.total ?? 0);
  const lastTotal = (aws?.months?.[1]?.total ?? 0) + (ant?.months?.[1]?.total ?? 0);

  return (
    <>
      <PageHeader title="Costs" description={snap ? `ValueHQ only (AWS resources tagged ${aws?.tag ?? 'app=valuehq'}). Updated ${timeAgo(snap.generatedAt)}; refreshed daily.` : 'AWS and Anthropic spend for ValueHQ, refreshed daily.'}>
        {canRefresh && <form action={refreshCosts}><Button type="submit" variant="outline"><RefreshCw />Refresh now</Button></form>}
      </PageHeader>
      <Flash saved={saved} error={error} />

      {!snap && (
        <Card><CardContent className="text-sm">
          <p className="font-medium">No cost data yet.</p>
          <p className="text-muted-foreground mt-1">{canRefresh ? 'The first snapshot is taken daily at 13:17 UTC, or select Refresh now.' : 'Costs are collected by the workers stack in AWS; see the README, “Costs”.'}</p>
        </CardContent></Card>
      )}

      {snap && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [usd(total), `${monthName(snap.month)} so far`],
              [usd(aws?.forecastMonthEnd != null ? aws.forecastMonthEnd + (antNow?.total ?? 0) : null), 'month-end estimate (AWS forecast + Anthropic so far)'],
              [usd(lastTotal), monthName(aws?.months?.[1]?.month ?? ant?.months?.[1]?.month)],
              [`${usd(awsNow?.total)} / ${usd(antNow?.total)}`, 'AWS / Anthropic this month'],
            ].map(([n, label]) => (
              <Card key={label} className="gap-1 py-4"><CardContent><div className="text-2xl font-semibold tabular-nums">{n}</div><div className="text-muted-foreground text-sm">{label}</div></CardContent></Card>
            ))}
          </div>

          {(aws?.error || aws?.noTaggedData || ant?.error) && (
            <Card className="border-amber-200 bg-amber-50"><CardContent className="flex flex-col gap-1.5 text-sm text-amber-900">
              {aws?.error && <p><strong>AWS:</strong> {aws.error}</p>}
              {aws?.noTaggedData && <p><strong>AWS:</strong> no costs tagged app=valuehq yet. Activate the <code>app</code> and <code>env</code> cost allocation tags (README, “Costs”); data appears about a day later and only from then on.</p>}
              {ant?.error && <p><strong>Anthropic:</strong> {ant.error} Anthropic costs need an Admin API key (README, “Costs”).</p>}
            </CardContent></Card>
          )}

          <Card>
            <CardHeader><CardTitle>Last 30 days</CardTitle></CardHeader>
            <CardContent><DailyChart aws={aws?.daily} anthropic={ant?.daily} /></CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Breakdown title="AWS by service" months={aws?.months} field="byService" />
            <div className="flex flex-col gap-6">
              <Breakdown title="AWS by environment" description="From the env tag. “untagged” is ValueHQ spend without an env tag." months={aws?.months} field="byEnv" />
              <Breakdown title="Anthropic by model" description={ant?.workspace ? `Workspace: ${ant.workspace}` : undefined} months={ant?.months} field="byModel" />
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1.5">
                <CardTitle>Estimated cost per org, {monthName(snap.month)}</CardTitle>
                <CardDescription>This month’s crawl containers (Fargate) and Claude spend, split by each org’s crawl time and tokens. Shared costs (app servers, storage, CloudFront) aren’t split.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {snap.orgs.length === 0 ? <p className="text-muted-foreground text-sm">No orgs yet.</p> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Org</TableHead><TableHead className="text-right">Crawls</TableHead><TableHead className="text-right">Pages</TableHead><TableHead className="text-right">Crawl time</TableHead>
                    <TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Fargate</TableHead><TableHead className="text-right">Anthropic</TableHead><TableHead className="text-right">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {snap.orgs.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.usage.crawls}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.usage.pages.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Math.round(o.usage.crawlSeconds / 60)} min</TableCell>
                        <TableCell className="text-right tabular-nums">{(o.usage.inputTokens + o.usage.outputTokens).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{usd(o.fargate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{usd(o.anthropic)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{usd(o.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-xs">Snapshot from the {snap.env} environment. AWS figures come from Cost Explorer (they lag by up to a day); Anthropic figures from the Admin API cost report.</p>
        </>
      )}
    </>
  );
}
