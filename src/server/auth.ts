import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@config/auth';
import { sessions, users, workspaces } from './repo';
import type { User, Workspace } from './types';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(email: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + auth.sessionDays * 86_400_000);
  await sessions.put({ id: hashToken(token), email, expiresAt: expiresAt.toISOString() });
  (await cookies()).set(auth.sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: auth.secureCookies, path: '/', expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(auth.sessionCookie)?.value;
  if (token) await sessions.remove(hashToken(token));
  jar.delete(auth.sessionCookie);
}

// Why someone can't use the app right now, shown on the sign-in page.
export type SignInBlock = 'disabled' | 'paused';
export function signInBlock(user: User, workspace: Workspace | null): SignInBlock | null {
  if (user.isOperator) return null; // operators can always get in, to fix things
  if (user.disabled) return 'disabled';
  if (!workspace || workspace.status === 'disabled') return 'paused';
  return null;
}

export interface SessionCtx {
  // The user the app acts as. For an operator inside a customer org, this is the operator with the admin
  // role in that org (same email, so changes are attributed to them).
  user: User;
  workspace: Workspace;
  // Set when a platform operator switched into a customer org: their real account.
  operator: User | null;
}

type State = { ok: true; ctx: SessionCtx } | { ok: false; reason: SignInBlock | 'signed-out' };

const sessionState = cache(async (): Promise<State> => {
  const token = (await cookies()).get(auth.sessionCookie)?.value;
  if (!token) return { ok: false, reason: 'signed-out' };
  const s = await sessions.get(hashToken(token));
  if (!s || new Date(s.expiresAt) < new Date()) return { ok: false, reason: 'signed-out' };
  const user = await users.get(s.email);
  if (!user) return { ok: false, reason: 'signed-out' }; // removed
  const own = await workspaces.get(user.workspaceId);
  const block = signInBlock(user, own);
  if (block) return { ok: false, reason: block };

  if (user.isOperator && s.actingWorkspaceId && s.actingWorkspaceId !== user.workspaceId) {
    const acting = await workspaces.get(s.actingWorkspaceId);
    if (acting) return { ok: true, ctx: { user: { ...user, role: 'admin', workspaceId: acting.id }, workspace: acting, operator: user } };
  }
  if (!own) return { ok: false, reason: 'signed-out' };
  return { ok: true, ctx: { user, workspace: own, operator: null } };
});

// The signed-in user and their workspace, or null. Cached for one request.
export async function getSession(): Promise<SessionCtx | null> {
  const st = await sessionState();
  return st.ok ? st.ctx : null;
}

export async function requireUser(): Promise<SessionCtx> {
  const st = await sessionState();
  if (st.ok) return st.ctx;
  redirect(st.reason === 'signed-out' ? '/login' : `/login?error=${st.reason}`);
}

// The real signed-in account when it's a platform operator (wherever they are acting), else sends them home.
export async function requireOperator(): Promise<SessionCtx & { me: User }> {
  const ctx = await requireUser();
  const me = ctx.operator ?? ctx.user;
  if (!me.isOperator) redirect('/');
  return { ...ctx, me };
}

// Operators: work inside a customer org as its admin (workspaceId), or go back to your own (null).
export async function setActingWorkspace(workspaceId: string | null) {
  const token = (await cookies()).get(auth.sessionCookie)?.value;
  if (!token) redirect('/login');
  const s = await sessions.get(hashToken(token));
  if (!s) redirect('/login');
  await sessions.put({ ...s, actingWorkspaceId: workspaceId ?? undefined });
}
