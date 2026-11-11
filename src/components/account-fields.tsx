import type { Account } from '@/server/types';
import { STAGES } from '@/lib/labels';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './field';

// Fields shared by "Add account" and the account details form.
export function AccountFields({ a }: { a?: Partial<Account> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name"><Input name="name" required defaultValue={a?.name ?? ''} placeholder="e.g., W.W. Grainger" /></Field>
      <Field label="Domain"><Input name="domain" defaultValue={a?.domain ?? ''} placeholder="grainger.com" /></Field>
      <Field label="Unit you sell into" className="sm:col-span-2"><Input name="unit" defaultValue={a?.unit ?? ''} placeholder="Leave empty for the whole company" /></Field>
      <Field label="Industry"><Input name="industry" defaultValue={a?.industry ?? ''} placeholder="Industrial distribution (MRO)" /></Field>
      <Field label="Ownership">
        <NativeSelect name="ownership" defaultValue={a?.ownership ?? 'public'}>
          <option value="public">Public (SEC filer)</option>
          <option value="private">Private</option>
        </NativeSelect>
      </Field>
      <Field label="Ticker"><Input name="ticker" defaultValue={a?.ticker ?? ''} placeholder="GWW" /></Field>
      <Field label="Priority">
        <NativeSelect name="priority" defaultValue={a?.priority ?? 'P2'}>
          <option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option>
        </NativeSelect>
      </Field>
      <Field label="Stage">
        <NativeSelect name="stage" defaultValue={a?.stage ?? 'researching'}>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={3} defaultValue={a?.notes ?? ''} placeholder="What you know and where you learned it" /></Field>
    </div>
  );
}
