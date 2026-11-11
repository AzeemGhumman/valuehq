import { redirect } from 'next/navigation';
import { pageContext } from '@/server/context';
import { renameWorkspace } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';

export const metadata = { title: 'Workspace' };

export default async function WorkspaceSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { workspace, caps } = await pageContext();
  if (!caps['workspace.settings']) redirect('/settings/roles?error=forbidden&need=Change%20workspace%20settings');
  const { saved, error, need } = await searchParams;
  return (
    <>
      <Flash saved={saved} error={error} need={need} />
      <Card>
        <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Workspace name</CardTitle><CardDescription>Shown to everyone in the workspace. Usually your company name.</CardDescription></div></CardHeader>
        <CardContent>
          <form action={renameWorkspace} className="flex max-w-md items-end gap-2">
            <Field label="Name" className="flex-1"><Input name="name" required defaultValue={workspace.name} /></Field>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div className="flex flex-col gap-1.5"><CardTitle>Usage</CardTitle><CardDescription>Usage tracking arrives with background job credits.</CardDescription></div></CardHeader>
      </Card>
    </>
  );
}
