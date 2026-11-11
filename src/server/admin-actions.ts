'use server';

// Platform admin console (/admin): actions only ValueHQ operators can run. Every action starts with
// requireOperator(). What operators can do is listed in config/roles.ts (OPERATOR).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@config/auth';
import { ROLES, type Role } from '@config/roles';
import { requireOperator, setActingWorkspace } from './auth';
import { startBuildProfile } from './jobs';
import { hashPassword } from './password';
import { accounts, company, newId, sessions, sources, users, workspaces } from './repo';
import { loadProfile, PROFILES } from './seed';
import type { User, Workspace } from './types';

const ROLE_KEYS = Object.keys(ROLES) as Role[];
const now = () => new Date().toISOString();
function text(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}
function required(fd: FormData, key: string): string {
  const v = text(fd, key);
  if (!v) throw new Error(`${key} is required`);
  return v;
}
const role = (fd: FormData): Role => { const r = text(fd, 'role'); return r && (ROLE_KEYS as string[]).includes(r) ? (r as Role) : 'member'; };
const go = (path: string, flag: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${flag}`);
const refresh = () => revalidatePath('/', 'layout');

// "acme.com" → "https://acme.com". Returns undefined for anything that isn't a web link.
function normalizeUrl(raw: string | undefined) {
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { const u = new URL(withScheme); return u.hostname.includes('.') ? u.toString() : undefined; } catch { return undefined; }
}
const hostLabel = (url: string) => new URL(url).hostname.replace(/^www\./, '');

async function org(id: string): Promise<Workspace> {
  const w = await workspaces.get(id);
  if (!w) throw new Error('Org not found');
  return w;
}
const orgPath = (id: string) => `/admin/orgs/${id}`;

// ---------- orgs ----------

// Creates an org with its company profile, sources and first admin, then (optionally) loads sample
// data and starts the build-profile job so the first admin sees their company filling in.
export async function provisionOrg(fd: FormData) {
  const { me } = await requireOperator();
  const name = required(fd, 'name');
  const website = normalizeUrl(text(fd, 'website'));
  const extra = (text(fd, 'urls') ?? '').split(/[\s,]+/).map(normalizeUrl).filter((u): u is string => !!u && u !== website);
  const adminEmail = required(fd, 'adminEmail').toLowerCase();
  const adminPassword = required(fd, 'adminPassword');
  const seed = text(fd, 'seed');
  if (adminPassword.length < auth.minPasswordLength) go('/admin/orgs/new', 'error=short-password');
  if (await users.get(adminEmail)) go('/admin/orgs/new', 'error=email-taken');
  if ((await workspaces.list()).some((w) => w.name.toLowerCase() === name.toLowerCase())) go('/admin/orgs/new', 'error=org-exists');

  const ws = await workspaces.create(name, { createdBy: me.email });
  await users.put({ email: adminEmail, name: required(fd, 'adminName'), role: 'admin', passwordHash: hashPassword(adminPassword), workspaceId: ws.id, createdAt: now() });

  if (seed && PROFILES[seed]) {
    await loadProfile(ws.id, seed, adminEmail);
  } else {
    await company.put(ws.id, { name, website, createdBy: me.email, updatedBy: me.email });
  }
  const t = now();
  const links = [...(website ? [{ url: website, kind: 'website', label: `${hostLabel(website)} (website)` }] : []), ...extra.map((url) => ({ url, kind: 'link', label: hostLabel(url) }))];
  for (const l of links) {
    await sources.put(ws.id, { id: newId(), ownerType: 'company', ownerId: ws.id, kind: l.kind, label: l.label, url: l.url, mode: 'one-time', status: 'ready', createdAt: t, createdBy: me.email, updatedBy: me.email });
  }

  let flag = 'saved=provisioned';
  if (text(fd, 'buildProfile') === 'on') {
    const job = await startBuildProfile(ws.id, me.email, name);
    flag = job ? 'saved=provisioned-job' : 'saved=provisioned&error=no-sources';
  }
  refresh();
  go(orgPath(ws.id), flag);
}

export async function renameOrg(fd: FormData) {
  await requireOperator();
  const w = await org(required(fd, 'id'));
  const name = required(fd, 'name');
  await workspaces.update({ ...w, name });
  const c = await company.get(w.id);
  if (c && c.name === w.name) await company.put(w.id, { ...c, name }); // keep them in step if they matched
  refresh();
  go(orgPath(w.id), 'saved=1');
}

// Disabled orgs keep their data; nobody in them can sign in until enabled again.
export async function setOrgStatus(fd: FormData) {
  await requireOperator();
  const w = await org(required(fd, 'id'));
  if (w.kind === 'internal') go(orgPath(w.id), 'error=internal');
  const status = text(fd, 'status') === 'disabled' ? 'disabled' : 'active';
  await workspaces.update({ ...w, status });
  if (status === 'disabled') for (const u of await users.list(w.id)) await sessions.removeFor(u.email);
  refresh();
  go(orgPath(w.id), status === 'disabled' ? 'saved=org-disabled' : 'saved=org-enabled');
}

export async function deleteOrg(fd: FormData) {
  await requireOperator();
  const w = await org(required(fd, 'id'));
  if (w.kind === 'internal') go(orgPath(w.id), 'error=internal');
  if ((text(fd, 'confirm') ?? '').toLowerCase() !== w.name.toLowerCase()) go(orgPath(w.id), 'error=confirm-name');
  await workspaces.remove(w.id);
  refresh();
  go('/admin', 'saved=deleted');
}

export async function loadSampleData(fd: FormData) {
  await requireOperator();
  const w = await org(required(fd, 'id'));
  const key = required(fd, 'seed');
  if (!PROFILES[key]) throw new Error('Unknown profile');
  await loadProfile(w.id, key);
  refresh();
  go(orgPath(w.id), 'saved=seeded');
}

export async function rebuildProfile(fd: FormData) {
  const { me } = await requireOperator();
  const w = await org(required(fd, 'id'));
  const name = (await company.get(w.id))?.name ?? w.name;
  const job = await startBuildProfile(w.id, me.email, name);
  refresh();
  go(orgPath(w.id), job ? 'saved=job' : 'error=no-sources');
}

// Work inside an org as its admin. A banner at the top of every page leads back.
export async function enterOrg(fd: FormData) {
  const { me } = await requireOperator();
  const w = await org(required(fd, 'id'));
  await setActingWorkspace(w.id === me.workspaceId ? null : w.id);
  refresh();
  redirect('/');
}

export async function exitOrg() {
  await requireOperator();
  await setActingWorkspace(null);
  refresh();
  redirect('/admin');
}

// ---------- people in an org ----------
async function admins(workspaceId: string, except?: string) {
  return (await users.list(workspaceId)).filter((u) => u.role === 'admin' && !u.disabled && u.email !== except);
}
async function member(email: string): Promise<User> {
  const u = await users.get(email);
  if (!u) throw new Error('User not found');
  return u;
}

export async function addOrgMember(fd: FormData) {
  await requireOperator();
  const w = await org(required(fd, 'id'));
  const email = required(fd, 'email').toLowerCase();
  const password = required(fd, 'password');
  if (password.length < auth.minPasswordLength) go(orgPath(w.id), 'error=short-password');
  if (await users.get(email)) go(orgPath(w.id), 'error=email-taken');
  const first = (await users.list(w.id)).length === 0;
  await users.put({
    email, name: required(fd, 'name'), role: first ? 'admin' : role(fd), passwordHash: hashPassword(password),
    workspaceId: w.id, createdAt: now(), isOperator: w.kind === 'internal' ? true : undefined,
  });
  go(orgPath(w.id), 'saved=member');
}

// Name, email, role and (optionally) password in one form. A new email re-keys the user and
// updates the accounts they own or are on the team of.
export async function updateOrgMember(fd: FormData) {
  const { me } = await requireOperator();
  const target = await member(required(fd, 'email'));
  const back = orgPath(target.workspaceId);
  const nextEmail = (text(fd, 'newEmail') ?? target.email).toLowerCase();
  const nextRole = (await workspaces.get(target.workspaceId))?.kind === 'internal' ? 'admin' : role(fd);
  const password = text(fd, 'password');
  if (password && password.length < auth.minPasswordLength) go(back, 'error=short-password');
  if (target.role === 'admin' && nextRole !== 'admin' && (await admins(target.workspaceId, target.email)).length === 0) go(back, 'error=last-admin');

  const updated: User = { ...target, name: text(fd, 'name') ?? target.name, role: nextRole, email: nextEmail, ...(password ? { passwordHash: hashPassword(password) } : {}) };
  if (nextEmail !== target.email) {
    if (!nextEmail.includes('@')) go(back, 'error=bad-email');
    if (await users.get(nextEmail)) go(back, 'error=email-taken');
    if (target.email === me.email) go(back, 'error=self-email');
    await users.put(updated);
    await users.remove(target.email);
    await sessions.removeFor(target.email);
    for (const a of await accounts.list(target.workspaceId)) {
      const team = a.teamEmails ?? [];
      if (a.ownerEmail === target.email || team.includes(target.email)) {
        await accounts.put(target.workspaceId, { ...a, ownerEmail: a.ownerEmail === target.email ? nextEmail : a.ownerEmail, teamEmails: team.map((e) => (e === target.email ? nextEmail : e)) });
      }
    }
  } else {
    await users.put(updated);
  }
  refresh();
  go(back, 'saved=member-updated');
}

export async function setUserDisabled(fd: FormData) {
  const { me } = await requireOperator();
  const target = await member(required(fd, 'email'));
  const back = orgPath(target.workspaceId);
  if (target.email === me.email) go(back, 'error=self-disable');
  const disabled = text(fd, 'disabled') === 'true';
  await users.put({ ...target, disabled: disabled || undefined });
  if (disabled) await sessions.removeFor(target.email);
  go(back, disabled ? 'saved=user-disabled' : 'saved=user-enabled');
}

export async function removeOrgMember(fd: FormData) {
  const { me } = await requireOperator();
  const target = await member(required(fd, 'email'));
  const back = orgPath(target.workspaceId);
  if (target.email === me.email) go(back, 'error=self-remove');
  const heirs = await admins(target.workspaceId, target.email);
  if (target.role === 'admin' && heirs.length === 0 && (await users.list(target.workspaceId)).length > 1) go(back, 'error=last-admin');
  const heir = heirs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.email;
  for (const a of await accounts.list(target.workspaceId)) {
    const team = a.teamEmails ?? [];
    if (a.ownerEmail === target.email || team.includes(target.email)) {
      await accounts.put(target.workspaceId, { ...a, ownerEmail: a.ownerEmail === target.email ? heir : a.ownerEmail, teamEmails: team.filter((e) => e !== target.email) });
    }
  }
  await users.remove(target.email);
  await sessions.removeFor(target.email);
  refresh();
  go(back, 'saved=removed');
}
