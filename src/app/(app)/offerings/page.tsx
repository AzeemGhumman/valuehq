import Link from 'next/link';
import { Plus } from 'lucide-react';
import { pageContext } from '@/server/context';
import { offerings } from '@/server/repo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Offerings' };

export default async function OfferingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { workspace, caps } = await pageContext();
  const { saved } = await searchParams;
  const list = await offerings.list(workspace.id);
  return (
    <>
      <PageHeader title="Offerings" description="One per product you sell. Each has its own sources and value map.">
        {caps['offerings.manage'] && <Button asChild><Link href="/offerings/new"><Plus />New offering</Link></Button>}
      </PageHeader>
      <Flash saved={saved} />
      <Card><CardContent>
        {list.length === 0 ? <p className="text-muted-foreground text-sm">No offerings yet.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Offering</TableHead><TableHead>Value map</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="max-w-xl whitespace-normal"><Link href={`/offerings/${o.id}`} className="font-medium hover:underline">{o.name}</Link>{o.summary && <div className="text-muted-foreground line-clamp-2 text-sm">{o.summary}</div>}</TableCell>
                  <TableCell>{o.valueRows.filter((r) => r.status === 'reviewed').length} of {o.valueRows.length} rows reviewed</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </>
  );
}
