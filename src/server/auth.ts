import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@config/auth';
import { sessions, users, workspaces } from './repo';

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

// The signed-in user and their workspace, or null. Cached for one request.
export const getSession = cache(async () => {
  const token = (await cookies()).get(auth.sessionCookie)?.value;
  if (!token) return null;
  const s = await sessions.get(hashToken(token));
  if (!s || new Date(s.expiresAt) < new Date()) return null;
  const user = await users.get(s.email);
  if (!user) return null; // removed with `npm run users -- remove`
  const workspace = await workspaces.get(user.workspaceId);
  if (!workspace) return null;
  return { user, workspace };
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}
