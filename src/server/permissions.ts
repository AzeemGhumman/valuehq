// Applies the rules in config/roles.ts. Use `can` to show or hide controls and `assertCan` in server actions.
import { redirect } from 'next/navigation';
import { PERMISSIONS, scopeFor, type Permission } from '@config/roles';
import type { Account, User, Workspace } from './types';

type Ctx = { user: User; workspace: Workspace };

// True when the user is the account's owner or on its team.
export function isOnAccount(user: User, account?: Pick<Account, 'ownerEmail' | 'teamEmails'> | null) {
  if (!account) return false;
  return account.ownerEmail === user.email || (account.teamEmails ?? []).includes(user.email);
}

// Can this user do `permission`? Pass the account for rules that may be limited to "own" accounts.
export function can(ctx: Ctx, permission: Permission, account?: Pick<Account, 'ownerEmail' | 'teamEmails'> | null): boolean {
  const scope = scopeFor(permission, ctx.user.role, ctx.workspace.grants);
  if (scope === 'any') return true;
  if (scope === 'own') return account === undefined ? true : isOnAccount(ctx.user, account);
  return false;
}

// For server actions: stops with a "not allowed" message instead of doing the change.
export function assertCan(ctx: Ctx, permission: Permission, account?: Pick<Account, 'ownerEmail' | 'teamEmails'> | null, back = '/') {
  if (!can(ctx, permission, account)) {
    const sep = back.includes('?') ? '&' : '?';
    redirect(`${back}${sep}error=forbidden&need=${encodeURIComponent(PERMISSIONS[permission].label)}`);
  }
}

// Everything the current user can do, for screens that show or hide controls.
export function capabilities(ctx: Ctx) {
  const out = {} as Record<Permission, boolean>;
  for (const p of Object.keys(PERMISSIONS) as Permission[]) out[p] = scopeFor(p, ctx.user.role, ctx.workspace.grants) !== null;
  return out;
}
