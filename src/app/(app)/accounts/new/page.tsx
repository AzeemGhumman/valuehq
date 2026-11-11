import Link from 'next/link';
import { createAccount } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccountFields } from '@/components/account-fields';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Add account' };

export default function NewAccountPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Add an account" description="Pick the company and the part you sell into. Add sources next." />
      <Card><CardContent>
        <form action={createAccount} className="flex flex-col gap-4">
          <AccountFields />
          <div className="flex justify-end gap-2"><Button asChild variant="outline"><Link href="/accounts">Cancel</Link></Button><Button type="submit">Add account</Button></div>
        </form>
      </CardContent></Card>
    </div>
  );
}
