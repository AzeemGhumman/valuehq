import Link from 'next/link';
import { Plus } from 'lucide-react';
import { pageContext } from '@/server/context';
import { isOnAccount } from '@/server/permissions';
import { users } from '@/server/repo';
import { accounts } from '@/server/repo';
import { STAGES } from '@/lib/labels';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Accounts' };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; need?: string; q?: string; mine?: string }> }) {
  const { user, workspace, caps } = await pageContext();
  const { saved, error, need, q, mine } = await searchParams;
  const [all, members] = await Promise.all([accounts.list(workspace.id), users.list(workspace.id)]);
  const nameOf = (email?: string) => members.find((m) => m.email === email)?.name ?? (email ? email : 'No owner');
  const list = all
    .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
    .filter((a) => !mine || isOnAccount(user, a)).sort((a, b) => a.priority.localeCompare(b.priority) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Accounts" description="Companies you sell to.">
        {caps['accounts.create'] && <Button asChild><Link href="/accounts/new"><Plus />Add account</Link></Button>}
      </PageHeader>
      <Flash saved={saved} error={error} need={need} />
      <Card><CardContent className="flex flex-col gap-4">
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q ?? ''} placeholder="Search accounts" aria-label="Search accounts" className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!mine} className="accent-primary size-4" />Only my accounts</label>
          <Button type="submit" variant="outline">Apply</Button>
        </form>
        {list.length === 0 ? <p className="text-muted-foreground text-sm">{q || mine ? 'No accounts match.' : 'No accounts yet.'}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Unit</TableHead><TableHead>Owner</TableHead><TableHead>Priority</TableHead><TableHead>Stage</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Link href={`/accounts/${a.id}`} className="font-medium hover:underline">{a.name}</Link>{a.ticker && <span className="text-muted-foreground"> · {a.ticker}</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{a.unit ?? 'Whole company'}</TableCell>
                  <TableCell>{a.ownerEmail === user.email ? 'You' : nameOf(a.ownerEmail)}</TableCell>
                  <TableCell><Badge variant={a.priority === 'P1' ? 'success' : a.priority === 'P2' ? 'info' : 'secondary'}>{a.priority}</Badge></TableCell>
                  <TableCell>{STAGES[a.stage]}</TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(a.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </>
  );
}
