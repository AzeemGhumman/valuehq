import { auth } from '@config/auth';
import { requireOperator } from '@/server/auth';
import { provisionOrg } from '@/server/admin-actions';
import { PROFILES } from '@/server/seed';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'New org' };

export default async function NewOrgPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireOperator();
  const { error } = await searchParams;
  return (
    <>
      <PageHeader eyebrow="Orgs" title="New org" description="Creates the workspace, its company profile and first admin. The profile job reads their website so they see their company when they first sign in." />
      <Flash error={error} />
      <form action={provisionOrg} className="flex flex-col gap-6">
        <Card>
          <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Company</CardTitle><CardDescription>Links become company sources. The job only reads public pages.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><Input name="name" required placeholder="Acme Robotics" /></Field>
            <Field label="Website"><Input name="website" placeholder="acme.com" /></Field>
            <Field label="Other links (one per line): product pages, press, about page" className="sm:col-span-2"><Textarea name="urls" rows={3} placeholder={'acme.com/product\nacme.com/about'} /></Field>
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
              <input type="checkbox" name="buildProfile" defaultChecked className="mt-0.5 size-4" />
              <span><span className="font-medium">Build their profile in the background</span><span className="text-muted-foreground block">Reads each link and drafts the empty fields of the company profile (Category, What we do). Nothing they write is overwritten.</span></span>
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>First admin</CardTitle><CardDescription>Send them these details privately. They can change the password under Settings.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><Input name="adminName" required /></Field>
            <Field label="Email"><Input name="adminEmail" type="email" required /></Field>
            <Field label={`Password (at least ${auth.minPasswordLength})`}><Input name="adminPassword" type="text" required minLength={auth.minPasswordLength} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Sample data (for demos)</CardTitle><CardDescription>Fills the org with a complete sample: company, offerings, accounts and sources. Leave empty for a real customer.</CardDescription></div></CardHeader>
          <CardContent>
            <Field label="Sample profile">
              <NativeSelect name="seed" defaultValue="" className="sm:max-w-md">
                <option value="">None: start empty</option>
                {Object.values(PROFILES).map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit" size="lg">Create org</Button></div>
      </form>
    </>
  );
}
