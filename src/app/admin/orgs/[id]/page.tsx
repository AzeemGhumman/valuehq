import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@config/auth';
import { aws } from '@config/aws';
import { jobs as jobsConfig } from '@config/jobs';
import { ROLES, ROLE_ORDER } from '@config/roles';
import { requireOperator } from '@/server/auth';
import {
  addOrgMember, crawlWebsite, deleteOrg, rerunCrawl, enterOrg, loadSampleData, rebuildProfile, removeOrgMember, renameOrg, setOrgStatus, setUserDisabled, updateOrgMember,
} from '@/server/admin-actions';
import { accounts, company, jobsRepo, offerings, sources, users, workspaces } from '@/server/repo';
import { PROFILES } from '@/server/seed';
import { canIngestWebsite } from '@/server/jobs';
import { CrawlReportView } from '@/components/crawl-report';
import { Textarea } from '@/components/ui/textarea';
import { shortDate, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { JobBadge } from '@/components/job-badge';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Org' };
export const dynamic = 'force-dynamic';

export default async function OrgPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { me } = await requireOperator();
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  const w = await workspaces.get(id);
  if (!w) notFound();
  const internal = w.kind === 'internal';
  const [people, c, offs, accts, srcs, jobs] = await Promise.all([
    users.list(w.id), company.get(w.id), offerings.list(w.id), accounts.list(w.id), sources.list(w.id, 'company', w.id), jobsRepo.list(w.id),
  ]);
  people.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const disabled = w.status === 'disabled';
  const workers = canIngestWebsite();
  const crawls = jobs.filter((j) => j.jobType === 'ingest-website');
  const lastCrawl = crawls[0];
  const crawlRunning = !!lastCrawl && (lastCrawl.status === 'queued' || lastCrawl.status === 'running');
  const consoleUrl = (arn?: string) => (arn ? `https://${aws.region}.console.aws.amazon.com/states/home?region=${aws.region}#/v2/executions/details/${arn}` : undefined);

  return (
    <>
      <AutoRefresh active={running} ms={jobsConfig.pollMs} />
      <PageHeader
        eyebrow={<Link href="/admin" className="hover:underline">Orgs</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{w.name}{internal ? <Badge variant="info">Platform team</Badge> : disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>}</span>}
        description={`Created ${shortDate(w.createdAt)}${w.createdBy ? ` by ${w.createdBy}` : ''} · ${people.length} people · ${offs.length} offerings · ${accts.length} accounts`}
      >
        {!internal && <form action={enterOrg}><input type="hidden" name="id" value={w.id} /><Button type="submit">Open as admin</Button></form>}
      </PageHeader>
      <Flash saved={saved} error={error} />

      {!internal && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Company profile</CardTitle><CardDescription>{c?.updatedBy ? `Last edited by ${c.updatedBy} · ${timeAgo(c.updatedAt)}` : 'Not started'}</CardDescription></div></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Name</dt><dd>{c?.name ?? w.name}</dd>
                <dt className="text-muted-foreground">Website</dt><dd className="truncate">{c?.website ?? '–'}</dd>
                <dt className="text-muted-foreground">Category</dt><dd>{c?.tagline ?? '–'}</dd>
                <dt className="text-muted-foreground">What they do</dt><dd className="line-clamp-3">{c?.whatWeDo ?? '–'}</dd>
              </dl>
              <div>
                <div className="text-muted-foreground mb-1">Company sources ({srcs.length})</div>
                {srcs.length === 0 ? <p className="text-muted-foreground">None. Open the org as admin to add some.</p> : (
                  <ul className="flex flex-col gap-1">{srcs.map((s) => <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate">{s.label}</span><Badge variant={s.status === 'needs-help' ? 'warning' : 'secondary'}>{s.status === 'needs-help' ? 'Needs help' : 'Ready'}</Badge></li>)}</ul>
                )}
              </div>
              {!workers && <form action={rebuildProfile}><input type="hidden" name="id" value={w.id} /><Button type="submit" variant="outline" size="sm" disabled={running}>{running ? 'A job is running…' : 'Build profile from sources'}</Button></form>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Background jobs</CardTitle></CardHeader>
            <CardContent className="flex flex-col divide-y text-sm">
              {jobs.length === 0 && <p className="text-muted-foreground">No jobs yet.</p>}
              {jobs.slice(0, 6).map((j) => (
                <details key={j.id} className="py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">{j.title}<span className="text-muted-foreground"> · {timeAgo(j.updatedAt)}</span></span>
                    <JobBadge status={j.status} />
                  </summary>
                  <ul className="text-muted-foreground mt-2 flex flex-col gap-1 pl-1">
                    {j.steps.map((s, i) => <li key={i} className="flex items-start justify-between gap-3"><span><span className="text-foreground">{s.name}</span>{s.detail && ` · ${s.detail}`}</span><JobBadge status={s.status} /></li>)}
                    {j.error && <li className="text-red-700">{j.error}</li>}
                    {consoleUrl(j.executionArn) && <li><a href={consoleUrl(j.executionArn)} target="_blank" rel="noreferrer" className="underline">Open in Step Functions</a></li>}
                  </ul>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {!internal && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>Website crawl</CardTitle>
              <CardDescription>{workers ? 'Runs in the workers stack: every page and file is stored once in S3, then Claude summarizes the site. Pages that didn’t change aren’t downloaded again.' : 'Website crawling runs in AWS (the workers stack) and isn’t available here.'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!lastCrawl && <p className="text-muted-foreground text-sm">This org’s website hasn’t been crawled yet.</p>}
            {lastCrawl && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">Last crawl</span>
                  <JobBadge status={lastCrawl.status} />
                  <span className="text-muted-foreground">started {timeAgo(lastCrawl.createdAt)} by {lastCrawl.createdBy}{lastCrawl.finishedAt ? ` · finished ${timeAgo(lastCrawl.finishedAt)}` : ''}</span>
                </div>
                {lastCrawl.crawl && (
                  <p className="text-muted-foreground text-xs">
                    {lastCrawl.crawl.start_url} · up to {lastCrawl.crawl.max_pages ?? 500} pages · {lastCrawl.crawl.strategy === 'dfs' ? 'depth first' : 'breadth first'}
                    {lastCrawl.crawl.scope?.length ? ` · only ${lastCrawl.crawl.scope.join(', ')}` : ' · whole site'}
                    {lastCrawl.crawl.include?.length ? ` · include ${lastCrawl.crawl.include.join(', ')}` : ''}
                    {lastCrawl.crawl.exclude?.length ? ` · exclude ${lastCrawl.crawl.exclude.join(', ')}` : ''}
                    {lastCrawl.crawl.render_js ? ' · JavaScript' : ''}{lastCrawl.analyze === false ? ' · no summary' : ' · with Claude summary'}
                  </p>
                )}
                <ol className="flex flex-col divide-y rounded-lg border text-sm">
                  {lastCrawl.steps.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0"><span className="font-medium">{s.name}</span>{s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}</span>
                      <JobBadge status={s.status} />
                    </li>
                  ))}
                </ol>
                {lastCrawl.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{lastCrawl.error}</p>}
                <CrawlReportView report={lastCrawl.report} analysis={lastCrawl.analysis} showLocation />
                <div className="flex flex-wrap items-center gap-2">
                  {workers && lastCrawl.crawl && (
                    <>
                      <form action={rerunCrawl}>
                        <input type="hidden" name="id" value={w.id} /><input type="hidden" name="jobId" value={lastCrawl.id} />
                        <Button type="submit" size="sm" disabled={crawlRunning}>{crawlRunning ? 'Crawl running…' : 'Re-run crawl'}</Button>
                      </form>
                      {!!lastCrawl.crawl.scope?.length && (
                        <form action={rerunCrawl}>
                          <input type="hidden" name="id" value={w.id} /><input type="hidden" name="jobId" value={lastCrawl.id} /><input type="hidden" name="whole" value="1" />
                          <Button type="submit" size="sm" variant="outline" disabled={crawlRunning}>Re-run on the whole site</Button>
                        </form>
                      )}
                    </>
                  )}
                  {lastCrawl.report && <Button asChild size="sm" variant="outline"><Link href={`/admin/orgs/${w.id}/crawls/${encodeURIComponent(lastCrawl.report.host)}/${encodeURIComponent(lastCrawl.report.crawlId)}`}>Open in crawl explorer</Link></Button>}
                  <Link href={`/admin/orgs/${w.id}/crawls`} className="text-muted-foreground text-xs underline">All crawls of this org</Link>
                  {consoleUrl(lastCrawl.executionArn) && <a href={consoleUrl(lastCrawl.executionArn)} target="_blank" rel="noreferrer" className="text-muted-foreground text-xs underline">Open in Step Functions</a>}
                </div>
                {crawls.length > 1 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">Earlier crawls ({crawls.length - 1})</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {crawls.slice(1, 11).map((j) => (
                        <li key={j.id} className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>{timeAgo(j.createdAt)} · {j.report ? <Link href={`/admin/orgs/${w.id}/crawls/${encodeURIComponent(j.report.host)}/${encodeURIComponent(j.report.crawlId)}`} className="underline">{j.title}</Link> : j.title}{j.report ? ` · ${j.report.pages} pages, ${Math.round(j.report.successRate * 100)}% success` : ''}</span>
                          <JobBadge status={j.status} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {workers && <p className="border-t pt-4 text-sm font-medium">New crawl with different settings</p>}
            {workers && (
              <form action={crawlWebsite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="id" value={w.id} />
                <Field label="Website" className="sm:col-span-2"><Input name="url" defaultValue={c?.website ?? ''} placeholder="acme.com" required /></Field>
                <Field label="Max pages"><Input name="maxPages" type="number" min={1} max={20000} defaultValue={500} /></Field>
                <Field label="Max clicks from start"><Input name="maxDepth" type="number" min={0} max={50} defaultValue={6} /></Field>
                <Field label="Only these paths (re-crawl part of the site)" className="sm:col-span-2"><Textarea name="scope" rows={2} placeholder={'/pricing\n/products/**'} /></Field>
                <Field label="Include (empty = everything)"><Textarea name="include" rows={2} placeholder="/products/**" /></Field>
                <Field label="Exclude"><Textarea name="exclude" rows={2} placeholder="/blog/**" /></Field>
                <Field label="Order">
                  <NativeSelect name="strategy" defaultValue="bfs">
                    <option value="bfs">Breadth first (overview pages first)</option>
                    <option value="dfs">Depth first (follow each section down)</option>
                  </NativeSelect>
                </Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="renderJs" className="size-4" />Site needs JavaScript (slower)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="analyze" defaultChecked className="size-4" />Summarize with Claude after</label>
                <div className="flex items-end justify-end"><Button type="submit" disabled={crawlRunning}>{crawlRunning ? 'Crawl running…' : 'Start crawl'}</Button></div>
                <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-4">Paths use <code>*</code> within a segment and <code>**</code> for anything below, e.g. <code>/blog/**</code>. A plain path like <code>/docs</code> also covers everything under it. Logins, carts and feeds are always skipped.</p>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5">
            <CardTitle>{internal ? 'Operators' : 'People'}</CardTitle>
            <CardDescription>{internal ? 'Everyone here is a platform operator with full access to this console.' : 'Change anyone’s name, email, role or password, e.g. to set up a quick demo login. Leave the password empty to keep it.'}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {people.length === 0 && <p className="text-muted-foreground text-sm">Nobody yet.</p>}
          {people.map((p) => {
            const self = p.email === me.email;
            const fid = `u-${p.email}`;
            return (
              <div key={p.email} className={`rounded-lg border p-3 ${p.disabled ? 'bg-muted/50' : ''}`}>
                <form id={fid} action={updateOrgMember} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_140px_1fr_auto]">
                  <input type="hidden" name="email" value={p.email} />
                  <Field label="Name"><Input name="name" defaultValue={p.name} required /></Field>
                  <Field label="Email"><Input name="newEmail" type="email" defaultValue={p.email} required readOnly={self} /></Field>
                  <Field label="Role">
                    {internal ? <Input value="Operator" readOnly disabled /> : (
                      <NativeSelect name="role" defaultValue={p.role}>{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</NativeSelect>
                    )}
                  </Field>
                  <Field label="New password"><Input name="password" type="text" minLength={auth.minPasswordLength} placeholder="Keep current" autoComplete="off" /></Field>
                  <Button type="submit" variant="outline">Save</Button>
                </form>
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {p.disabled && <Badge variant="destructive">Sign-in off</Badge>}
                  {self && <Badge variant="info">You</Badge>}
                  <span>Last sign-in: {p.lastLoginAt ? timeAgo(p.lastLoginAt) : 'never'}</span>
                  <span>Owns {accts.filter((a) => a.ownerEmail === p.email).length} account(s)</span>
                  {!self && (
                    <span className="ml-auto flex gap-1">
                      <form action={setUserDisabled}>
                        <input type="hidden" name="email" value={p.email} /><input type="hidden" name="disabled" value={p.disabled ? 'false' : 'true'} />
                        <Button type="submit" variant="ghost" size="sm">{p.disabled ? 'Turn sign-in on' : 'Turn sign-in off'}</Button>
                      </form>
                      <form id={`rm-${p.email}`} action={removeOrgMember}><input type="hidden" name="email" value={p.email} /></form>
                      <ConfirmSubmit formId={`rm-${p.email}`} title={`Remove ${p.name}?`} description="They can’t sign in any more. Accounts they own move to the org’s first admin." confirmLabel="Remove" variant="ghost" size="sm">Remove</ConfirmSubmit>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <details className="rounded-lg border border-dashed p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><Plus className="size-4" />{internal ? 'Add an operator' : 'Add a person'}</summary>
            <form action={addOrgMember} className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_140px_1fr_auto]">
              <input type="hidden" name="id" value={w.id} />
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Email"><Input name="email" type="email" required /></Field>
              <Field label="Role">
                {internal ? <Input value="Operator" readOnly disabled /> : (
                  <NativeSelect name="role" defaultValue={people.length === 0 ? 'admin' : 'member'}>{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</NativeSelect>
                )}
              </Field>
              <Field label="Password"><Input name="password" type="text" required minLength={auth.minPasswordLength} autoComplete="off" /></Field>
              <Button type="submit">Add</Button>
            </form>
          </details>
        </CardContent>
      </Card>

      {!internal && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Org settings</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <form action={renameOrg} className="flex items-end gap-2">
                <input type="hidden" name="id" value={w.id} />
                <Field label="Org name" className="flex-1"><Input name="name" defaultValue={w.name} required /></Field>
                <Button type="submit" variant="outline">Rename</Button>
              </form>
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Load sample data</div>
                <p className="text-muted-foreground text-sm">Replaces the company profile, offerings, accounts, sources and jobs. People stay.</p>
                <form id={`seed-${w.id}`} action={loadSampleData} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={w.id} />
                  <NativeSelect name="seed" className="flex-1" defaultValue={Object.keys(PROFILES)[0]}>
                    {Object.values(PROFILES).map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
                  </NativeSelect>
                  <ConfirmSubmit formId={`seed-${w.id}`} title={`Replace ${w.name}’s data?`} description="Their company profile, offerings, accounts, sources and jobs are deleted and replaced with the sample. People and passwords stay." confirmLabel="Replace data">Load</ConfirmSubmit>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader><CardTitle>Access and deletion</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">{disabled ? 'Nobody in this org can sign in. Their data is kept.' : 'Disabling signs everyone in this org out and stops them signing in. Data is kept.'}</p>
                <form action={setOrgStatus}>
                  <input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value={disabled ? 'active' : 'disabled'} />
                  <Button type="submit" variant={disabled ? 'default' : 'outline'}>{disabled ? 'Enable org' : 'Disable org'}</Button>
                </form>
              </div>
              <form id={`del-${w.id}`} action={deleteOrg} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={w.id} />
                <Field label={`Delete forever: type “${w.name}” to confirm`}><Input name="confirm" autoComplete="off" /></Field>
                <div><ConfirmSubmit formId={`del-${w.id}`} title={`Delete ${w.name}?`} description="Deletes the org, its people and all of its data. This can’t be undone." confirmLabel="Delete org" variant="destructive">Delete org</ConfirmSubmit></div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
