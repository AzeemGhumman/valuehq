import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createOffering } from '@/server/actions';
import { pageContext } from '@/server/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'New offering' };

export default async function NewOfferingPage() {
  const { caps } = await pageContext();
  if (!caps['offerings.manage']) redirect('/offerings?error=forbidden&need=Create%20offerings');
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="New offering" description="A product you sell. Add sources and a value map next." />
      <Card><CardContent>
        <form action={createOffering} className="flex flex-col gap-4">
          <Field label="Name"><Input name="name" required autoFocus placeholder="e.g., Quote Agent" /></Field>
          <Field label="What it does"><Textarea name="summary" rows={3} placeholder="One or two sentences" /></Field>
          <Field label="Who buys it"><Input name="whoBuys" placeholder="Comma-separated, e.g., VP Customer Service, CFO" /></Field>
          <div className="flex justify-end gap-2"><Button asChild variant="outline"><Link href="/offerings">Cancel</Link></Button><Button type="submit">Create offering</Button></div>
        </form>
      </CardContent></Card>
    </div>
  );
}
