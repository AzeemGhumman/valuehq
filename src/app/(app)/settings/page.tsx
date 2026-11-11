import { requireUser } from '@/server/auth';
import { users } from '@/server/repo';
import { changePassword, updateProfile } from '@/server/actions';
import { app } from '@config/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { user, workspace } = await requireUser();
  const { saved, error } = await searchParams;
  const members = (await users.list(workspace.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <PageHeader title="Settings" description={<>{workspace.name} workspace · <Badge variant="secondary">{app.env}</Badge></>} />
      <Flash saved={saved} error={error} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your profile</CardTitle></CardHeader>
          <CardContent>
            <form action={updateProfile} className="flex flex-col gap-4">
              <Field label="Name"><Input name="name" required defaultValue={user.name} /></Field>
              <Field label="Email"><Input value={user.email} disabled readOnly /></Field>
              <div className="flex justify-end"><Button type="submit">Save</Button></div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent>
            <form action={changePassword} className="flex flex-col gap-4">
              <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
              <Field label="New password"><Input name="next" type="password" required minLength={10} autoComplete="new-password" /></Field>
              <div className="flex justify-end"><Button type="submit">Change password</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5"><CardTitle>Members</CardTitle><CardDescription>Add and remove people with <code className="bg-muted rounded px-1">npm run users</code> (see the README).</CardDescription></div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.email}>
                  <TableCell className="font-medium">{m.name}{m.email === user.email && <span className="text-muted-foreground font-normal"> (you)</span>}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell className="capitalize">{m.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
