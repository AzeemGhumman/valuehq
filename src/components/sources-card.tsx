import { ExternalLink, Plus } from 'lucide-react';
import { addSource, deleteSource } from '@/server/actions';
import { SOURCE_KINDS } from '@/lib/labels';
import type { OwnerType, Source } from '@/server/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmSubmit } from './confirm-submit';
import { Field } from './field';

const statusBadge = (s: Source['status']) =>
  s === 'needs-help' ? <Badge variant="warning">Needs help</Badge> : s === 'processing' ? <Badge variant="info">Processing</Badge> : <Badge variant="success">Ready</Badge>;

export function SourcesCard({ ownerType, ownerId, items, returnTo, note, action }: {
  ownerType: OwnerType; ownerId: string; items: Source[]; returnTo: string; note?: string; action?: React.ReactNode;
}) {
  const live = items.filter((s) => s.mode === 'live').length;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1.5">
          <CardTitle>Sources</CardTitle>
          <CardDescription>{items.length} sources · {live} live{note ? ` · ${note}` : ''}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sources yet. Add a website, a Drive folder, a file or a link.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Type</TableHead><TableHead>Updates</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {items.map((s) => {
                const formId = `del-src-${s.id}`;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[340px]">
                      <div className="font-medium">{s.label}</div>
                      {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary inline-flex max-w-full items-center gap-1 truncate text-xs">{s.url}<ExternalLink className="size-3 shrink-0" /></a>}
                      {s.note && <div className="text-xs text-amber-700">{s.note}</div>}
                    </TableCell>
                    <TableCell>{SOURCE_KINDS[s.kind] ?? s.kind}</TableCell>
                    <TableCell>{s.mode === 'live' ? <span className="text-emerald-700">● Live</span> : 'One-time'}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-right">
                      <form id={formId} action={deleteSource}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="ownerType" value={s.ownerType} />
                        <input type="hidden" name="ownerId" value={s.ownerId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                      </form>
                      <ConfirmSubmit formId={formId} title={`Remove ${s.label}?`} description="ValueHQ stops using this source." confirmLabel="Remove" variant="ghost" size="sm">Remove</ConfirmSubmit>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <details className="group">
          <summary className="list-none [&::-webkit-details-marker]:hidden">
            <span className="border-input hover:bg-accent inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-xs"><Plus className="size-4" />Add source</span>
          </summary>
          <form action={addSource} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="ownerType" value={ownerType} />
            <input type="hidden" name="ownerId" value={ownerId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Field label="Type">
              <NativeSelect name="kind" defaultValue="link">
                {Object.entries(SOURCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Name"><Input name="label" required placeholder="e.g., comena.ai or pitch-deck.pdf" /></Field>
            <Field label="Link (optional)" className="sm:col-span-2"><Input name="url" type="url" placeholder="https://" /></Field>
            <Field label="Updates">
              <NativeSelect name="mode" defaultValue="one-time">
                <option value="one-time">One-time</option>
                <option value="live">Live (re-check regularly)</option>
              </NativeSelect>
            </Field>
            <div className="flex items-end justify-end"><Button type="submit">Add source</Button></div>
            <p className="text-muted-foreground text-xs sm:col-span-2">File upload isn’t built yet. Sources with a link can be checked with a background job.</p>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}
