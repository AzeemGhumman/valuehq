import { requireUser } from '@/server/auth';
import { company, sources } from '@/server/repo';
import { updateCompany } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';
import { SourcesCard } from '@/components/sources-card';

export const metadata = { title: 'My company' };

const FACTS = [['website', 'Website'], ['tagline', 'Category'], ['founded', 'Founded'], ['location', 'Location'], ['stage', 'Stage'], ['headcount', 'Team size']] as const;
const ABOUT = [['whatWeDo', 'What we do'], ['whoWeSellTo', 'Who we sell to'], ['problem', 'Problem we solve'], ['howItWorks', 'How it works'], ['whyUs', 'Why customers choose us'], ['proof', 'Proof']] as const;

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { workspace } = await requireUser();
  const { saved } = await searchParams;
  const [c, items] = await Promise.all([company.get(workspace.id), sources.list(workspace.id, 'company', workspace.id)]);
  const name = c?.name ?? workspace.name;

  return (
    <>
      <PageHeader title={name} description="Everything ValueHQ knows about you comes from these sources and this summary." />
      <Flash saved={saved} />
      <SourcesCard ownerType="company" ownerId={workspace.id} items={items} returnTo="/company" note="sources about one product go on that offering" />
      <Card>
        <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>About {name}</CardTitle><CardDescription>Used in every brief, deck and email</CardDescription></div></CardHeader>
        <CardContent>
          <form action={updateCompany} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><Input name="name" required defaultValue={name} /></Field>
            {FACTS.map(([k, label]) => <Field key={k} label={label}><Input name={k} defaultValue={c?.[k] ?? ''} /></Field>)}
            {ABOUT.map(([k, label]) => <Field key={k} label={label} className="sm:col-span-2"><Textarea name={k} rows={2} defaultValue={c?.[k] ?? ''} /></Field>)}
            <div className="flex justify-end sm:col-span-2"><Button type="submit">Save</Button></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
