// Everything a page needs about the signed-in user: who they are, their workspace and what they can do.
import { requireUser } from './auth';
import { can, capabilities } from './permissions';
import type { Account } from './types';

export async function pageContext() {
  const ctx = await requireUser();
  return {
    ...ctx,
    caps: capabilities(ctx),
    canOn: (permission: Parameters<typeof can>[1], account?: Pick<Account, 'ownerEmail' | 'teamEmails'> | null) => can(ctx, permission, account),
  };
}
