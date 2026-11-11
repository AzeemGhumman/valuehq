import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/server/auth';
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

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ saved?: string; q?: string }> }) {
  const { workspace } = await requireUser();
  const { saved, q } = await searchParams;
  const all = await accounts.list(workspace.id);
  const list = (q ? all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())) : all).sort((a, b) => a.priority.localeCompare(b.priority) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Accounts" description="Companies you sell to.">
        <Button asChild><Link href="/accounts/new"><Plus />Add account</Link></Button>
      </PageHeader>
      <Flash saved={saved} />
      <Card><CardContent className="flex flex-col gap-4">
        <form className="flex max-w-sm gap-2"><Input name="q" defaultValue={q ?? ''} placeholder="Search accounts" aria-label="Search accounts" /><Button type="submit" variant="outline">Search</Button></form>
        {list.length === 0 ? <p className="text-muted-foreground text-sm">{q ? 'No accounts match.' : 'No accounts yet.'}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Unit</TableHead><TableHead>Industry</TableHead><TableHead>Priority</TableHead><TableHead>Stage</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Link href={`/accounts/${a.id}`} className="font-medium hover:underline">{a.name}</Link>{a.ticker && <span className="text-muted-foreground"> · {a.ticker}</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{a.unit ?? 'Whole company'}</TableCell>
                  <TableCell>{a.industry ?? '—'}</TableCell>
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
