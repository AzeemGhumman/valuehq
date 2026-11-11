import { notFound } from 'next/navigation';
import { Copy, Plus } from 'lucide-react';
import { pageContext } from '@/server/context';
import { ViewOnly } from '@/components/view-only';
import { offerings, sources } from '@/server/repo';
import { addValueRow, deleteOffering, deleteValueRow, duplicateOffering, updateOffering, updateValueRow } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';
import { SourcesCard } from '@/components/sources-card';

const COLS = 'grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_120px_80px]';

export default async function OfferingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { workspace, caps } = await pageContext();
  const { id } = await params;
  const { saved, error, need } = await searchParams;
  const canManage = caps['offerings.manage'];
  const canEdit = caps['offerings.edit'];
  const canEditRows = caps['valuemap.edit'];
  const o = await offerings.get(workspace.id, id);
  if (!o) notFound();
  const items = await sources.list(workspace.id, 'offering', o.id);
  const reviewed = o.valueRows.filter((r) => r.status === 'reviewed').length;
  const path = `/offerings/${o.id}`;

  return (
    <>
      <PageHeader eyebrow="Offering" title={o.name} description={o.updatedBy ? `Last edited by ${o.updatedBy}` : undefined}>
        {canManage && <>
        <form action={duplicateOffering}><input type="hidden" name="id" value={o.id} /><Button type="submit" variant="outline"><Copy />Duplicate</Button></form>
        <form id="delete-offering" action={deleteOffering}><input type="hidden" name="id" value={o.id} /></form>
        <ConfirmSubmit formId="delete-offering" title={`Delete ${o.name}?`} description="Its value map and sources are deleted too. This can’t be undone.">Delete</ConfirmSubmit>
        </>}
      </PageHeader>
      <Flash saved={saved} error={error} need={need} />

      <SourcesCard ownerType="offering" ownerId={o.id} items={items} returnTo={path} note="company-wide sources are used too" canEdit={canEdit} />

      <Card>
        <CardHeader><CardTitle>About {o.name}</CardTitle>{!canEdit && <ViewOnly what="edit offerings" />}</CardHeader>
        <CardContent>
          <form action={updateOffering}><fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={o.id} />
            <Field label="Name"><Input name="name" required defaultValue={o.name} /></Field>
            <Field label="Who buys it"><Input name="whoBuys" defaultValue={o.whoBuys ?? ''} placeholder="Comma-separated roles" /></Field>
            <Field label="What it does" className="sm:col-span-2"><Textarea name="summary" rows={3} defaultValue={o.summary ?? ''} /></Field>
            {canEdit && <div className="flex justify-end sm:col-span-2"><Button type="submit">Save</Button></div>}
          </fieldset></form>
        </CardContent>
      </Card>

      <Card id="value-map">
        <CardHeader>
          <div className="flex flex-col gap-1.5"><CardTitle>Value map</CardTitle><CardDescription>{reviewed} of {o.valueRows.length} rows reviewed · only reviewed rows are used as written</CardDescription></div>
          {!canEditRows && <ViewOnly what="edit the value map" />}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className={`${COLS} text-muted-foreground hidden border-b pb-2 text-xs font-medium tracking-wide uppercase lg:grid`}>
            <span>Capability</span><span>Business outcome</span><span>Metric it moves</span><span>Proof</span><span>Review</span><span />
          </div>
          {o.valueRows.length === 0 && <p className="text-muted-foreground text-sm">No rows yet. Add what the product does and the outcome it drives.</p>}
          {o.valueRows.map((r) => (
            <form key={r.id} id={`row-${r.id}`} action={updateValueRow}><fieldset disabled={!canEditRows} className={`${COLS} items-start border-b pb-3`}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="offeringId" value={o.id} />
              <Textarea name="capability" rows={2} required defaultValue={r.capability} aria-label="Capability" />
              <Textarea name="outcome" rows={2} defaultValue={r.outcome ?? ''} aria-label="Business outcome" />
              <Textarea name="metric" rows={2} defaultValue={r.metric ?? ''} aria-label="Metric it moves" />
              <Textarea name="proof" rows={2} defaultValue={r.proof ?? ''} aria-label="Proof" />
              <NativeSelect name="status" defaultValue={r.status} aria-label="Review status">
                <option value="drafted">Drafted</option>
                <option value="reviewed">Reviewed</option>
                <option value="unproven">Unproven</option>
              </NativeSelect>
              <div className="flex gap-1 lg:flex-col">
                {canEditRows && <>
                <Button type="submit" size="sm" variant="outline">Save</Button>
                <ConfirmSubmit formId={`row-${r.id}`} formAction={deleteValueRow} title="Remove this row?" confirmLabel="Remove" variant="ghost" size="sm">Remove</ConfirmSubmit>
                </>}
              </div>
            </fieldset></form>
          ))}
          {canEditRows && <details>
            <summary className="list-none [&::-webkit-details-marker]:hidden">
              <span className="border-input hover:bg-accent inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-xs"><Plus className="size-4" />Add row</span>
            </summary>
            <form action={addValueRow} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="offeringId" value={o.id} />
              <Field label="Capability"><Input name="capability" required placeholder="What the product does" /></Field>
              <Field label="Business outcome"><Input name="outcome" placeholder="What changes for the buyer" /></Field>
              <Field label="Metric it moves"><Input name="metric" placeholder="e.g., Rep hours per order" /></Field>
              <Field label="Proof"><Input name="proof" placeholder="Case study, pilot data, vendor claim" /></Field>
              <div className="flex justify-end sm:col-span-2"><Button type="submit">Add row</Button></div>
            </form>
          </details>}
        </CardContent>
      </Card>
    </>
  );
}
