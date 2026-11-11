import { Plus } from 'lucide-react';
import { auth } from '@config/auth';
import { ROLES, ROLE_ORDER } from '@config/roles';
import { pageContext } from '@/server/context';
import { accounts, users } from '@/server/repo';
import { addMember, changeRole, removeMember, resetMemberPassword } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Field } from '@/components/field';
import { Flash } from '@/components/flash';
import { ViewOnly } from '@/components/view-only';

export const metadata = { title: 'Members' };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { user, workspace, caps } = await pageContext();
  const { saved, error, need } = await searchParams;
  const [members, accts] = await Promise.all([users.list(workspace.id), accounts.list(workspace.id)]);
  members.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const canManage = caps['members.manage'];
  const owned = (email: string) => accts.filter((a) => a.ownerEmail === email).length;

  return (
    <>
      <Flash saved={saved} error={error} need={need} />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5">
            <CardTitle>Members</CardTitle>
            <CardDescription>{members.length} people in {workspace.name}. What each role can do is on the Roles tab.</CardDescription>
          </div>
          {!canManage && <ViewOnly what="manage members" />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Accounts owned</TableHead><TableHead>Role</TableHead>{canManage && <TableHead />}</TableRow></TableHeader>
            <TableBody>
              {members.map((m) => {
                const me = m.email === user.email;
                return (
                  <TableRow key={m.email}>
                    <TableCell className="font-medium">{m.name}{me && <span className="text-muted-foreground font-normal"> (you)</span>}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell className="tabular-nums">{owned(m.email)}</TableCell>
                    <TableCell>
                      {canManage && !me ? (
                        <form action={changeRole} className="flex items-center gap-2">
                          <input type="hidden" name="email" value={m.email} />
                          <NativeSelect name="role" defaultValue={m.role} className="h-8 w-32" aria-label={`Role for ${m.name}`}>
                            {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                          </NativeSelect>
                          <Button type="submit" size="sm" variant="outline">Change</Button>
                        </form>
                      ) : ROLES[m.role]?.label ?? m.role}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {!me && (
                          <div className="flex justify-end gap-1">
                            <details className="relative">
                              <summary className="hover:bg-accent inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm [&::-webkit-details-marker]:hidden">Reset password</summary>
                              <form action={resetMemberPassword} className="bg-card absolute right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-lg border p-3 shadow-md">
                                <input type="hidden" name="email" value={m.email} />
                                <Input name="password" type="text" required minLength={auth.minPasswordLength} placeholder="New password" aria-label="New password" />
                                <Button type="submit" size="sm">Set password</Button>
                              </form>
                            </details>
                            <form id={`rm-${m.email}`} action={removeMember}><input type="hidden" name="email" value={m.email} /></form>
                            <ConfirmSubmit formId={`rm-${m.email}`} title={`Remove ${m.name}?`} description={`They can’t sign in any more. ${owned(m.email) ? `Their ${owned(m.email)} account(s) move to you. ` : ''}They’re taken off every account team.`} confirmLabel="Remove" variant="ghost" size="sm">Remove</ConfirmSubmit>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5"><CardTitle>Add a member</CardTitle><CardDescription>Share the password with them privately. They can change it under Your profile.</CardDescription></div>
          </CardHeader>
          <CardContent>
            <form action={addMember} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Email"><Input name="email" type="email" required /></Field>
              <Field label={`Password (at least ${auth.minPasswordLength} characters)`}><Input name="password" type="text" required minLength={auth.minPasswordLength} /></Field>
              <Field label="Role">
                <NativeSelect name="role" defaultValue="member">
                  {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                </NativeSelect>
              </Field>
              <div className="flex justify-end sm:col-span-2"><Button type="submit"><Plus />Add member</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
