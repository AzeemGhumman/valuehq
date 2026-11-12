import { pageContext } from '@/server/context';
import { ViewOnly } from '@/components/view-only';
import { company, jobsRepo, sources } from '@/server/repo';
import { updateCompany } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';
import { SourcesCard } from '@/components/sources-card';
import { ProfileJobBanner } from '@/components/profile-job-banner';

export const metadata = { title: 'My company' };

const FACTS = [['website', 'Website'], ['tagline', 'Category'], ['founded', 'Founded'], ['location', 'Location'], ['stage', 'Stage'], ['headcount', 'Team size']] as const;
const ABOUT = [['whatWeDo', 'What we do'], ['whoWeSellTo', 'Who we sell to'], ['problem', 'Problem we solve'], ['howItWorks', 'How it works'], ['pricing', 'Pricing model'], ['whyUs', 'Why customers choose us'], ['proof', 'Proof']] as const;

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { workspace, caps } = await pageContext();
  const { saved, error, need } = await searchParams;
  const canEdit = caps['company.edit'];
  const [c, items, jobs] = await Promise.all([company.get(workspace.id), sources.list(workspace.id, 'company', workspace.id), jobsRepo.list(workspace.id)]);
  const name = c?.name ?? workspace.name;

  return (
    <>
      <PageHeader title={name} description="Everything ValueHQ knows about you comes from these sources and this summary." />
      <Flash saved={saved} error={error} need={need} />
      <ProfileJobBanner jobs={jobs} company={c} linkToCompany={false} />
      <SourcesCard ownerType="company" ownerId={workspace.id} items={items} returnTo="/company" note="sources about one product go on that offering" canEdit={canEdit} />
      <Card>
        <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>About {name}</CardTitle><CardDescription>Used in every brief, deck and email{c?.updatedBy ? ` · last edited by ${c.updatedBy}` : ''}</CardDescription></div>{!canEdit && <ViewOnly what="edit the company profile" />}</CardHeader>
        <CardContent>
          <form action={updateCompany}><fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><Input name="name" required defaultValue={name} /></Field>
            {FACTS.map(([k, label]) => <Field key={k} label={label}><Input name={k} defaultValue={c?.[k] ?? ''} /></Field>)}
            {ABOUT.map(([k, label]) => <Field key={k} label={label} className="sm:col-span-2"><Textarea name={k} rows={2} defaultValue={c?.[k] ?? ''} /></Field>)}
            {canEdit && <div className="flex justify-end sm:col-span-2"><Button type="submit">Save</Button></div>}
          </fieldset></form>
        </CardContent>
      </Card>
    </>
  );
}
