import { auth } from '@config/auth';
import { pageContext } from '@/server/context';
import { changePassword, updateProfile } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';

export const metadata = { title: 'Settings' };

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { user } = await pageContext();
  const { saved, error } = await searchParams;
  return (
    <>
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
              <Field label={`New password (at least ${auth.minPasswordLength} characters)`}><Input name="next" type="password" required minLength={auth.minPasswordLength} autoComplete="new-password" /></Field>
              <div className="flex justify-end"><Button type="submit">Change password</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
