import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAccount } from '@/server/actions';
import { pageContext } from '@/server/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccountFields } from '@/components/account-fields';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Add account' };

export default async function NewAccountPage() {
  const { caps } = await pageContext();
  if (!caps['accounts.create']) redirect('/accounts?error=forbidden&need=Add%20accounts');
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
