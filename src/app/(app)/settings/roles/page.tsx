import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { PERMISSIONS, ROLES, ROLE_ORDER, scopeFor, type Permission, type PermissionRule, type Role } from '@config/roles';
import { pageContext } from '@/server/context';
import { resetRoleRules, updateRoleRules } from '@/server/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flash } from '@/components/flash';

export const metadata = { title: 'Roles' };

const SCOPE_LABEL = { any: 'All accounts', own: 'Their accounts', none: 'No' } as const;

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; need?: string }> }) {
  const { workspace, caps } = await pageContext();
  const { saved, error, need } = await searchParams;
  const canChange = caps['workspace.settings'];
  const entries = Object.entries(PERMISSIONS) as [Permission, PermissionRule][];
  const groups = [...new Set(entries.map(([, r]) => r.group))];
  const changed = Object.keys(workspace.grants ?? {}).length > 0;

  const cell = (perm: Permission, rule: PermissionRule, role: Role) => {
    const scope = scopeFor(perm, role, workspace.grants);
    const isAccountRule = perm.startsWith('accounts.') || perm === 'jobs.run';
    if (canChange && rule.adjustable && role !== 'admin') {
      return (
        <NativeSelect name={`${perm}:${role}`} defaultValue={scope ?? 'none'} className="h-8 w-40" aria-label={`${rule.label} for ${ROLES[role].label}`}>
          <option value="any">{isAccountRule ? SCOPE_LABEL.any : 'Yes'}</option>
          {isAccountRule && <option value="own">{SCOPE_LABEL.own}</option>}
          <option value="none">{SCOPE_LABEL.none}</option>
        </NativeSelect>
      );
    }
    if (!scope) return <Minus className="size-4 text-slate-300" aria-label="No" />;
    if (scope === 'own') return <span className="text-sm">{SCOPE_LABEL.own}</span>;
    return <Check className="size-4 text-emerald-600" aria-label="Yes" />;
  };

  return (
    <>
      <Flash saved={saved} error={error} need={need} />
      <div className="grid gap-3 md:grid-cols-3">
        {ROLE_ORDER.map((r) => (
          <Card key={r} className="gap-2 py-4"><CardContent><div className="font-semibold">{ROLES[r].label}</div><p className="text-muted-foreground mt-1 text-sm">{ROLES[r].description}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5">
            <CardTitle>What each role can do</CardTitle>
            <CardDescription>
              Defaults live in <code className="bg-muted rounded px-1">config/roles.ts</code>.
              {canChange ? ' Rules with a menu can be changed for this workspace.' : ' Only admins can change these.'}
              {' '}“Their accounts” means accounts they own or are on the team of.
            </CardDescription>
          </div>
          {changed && <Badge variant="warning">Changed for this workspace</Badge>}
        </CardHeader>
        <CardContent>
          <form action={updateRoleRules} className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-1/2">Permission</TableHead>{ROLE_ORDER.map((r) => <TableHead key={r}>{ROLES[r].label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <Fragment key={g}>
                    <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="text-muted-foreground pt-5 text-xs font-semibold tracking-wide uppercase">{g}</TableCell></TableRow>
                    {entries.filter(([, r]) => r.group === g).map(([perm, rule]) => (
                      <TableRow key={perm}>
                        <TableCell className="whitespace-normal">{rule.label}</TableCell>
                        {ROLE_ORDER.map((role) => <TableCell key={role}>{cell(perm, rule, role)}</TableCell>)}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            {canChange && <div className="flex justify-end"><Button type="submit">Save rules</Button></div>}
          </form>
          {canChange && changed && (
            <form action={resetRoleRules} className="mt-2 flex justify-end"><Button type="submit" variant="ghost" size="sm">Reset to defaults</Button></form>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">Everyone can always edit their own name and password.</p>
    </>
  );
}
