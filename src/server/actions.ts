'use server';

// Every create, update and delete in the app. Each action checks the signed-in user's role
// against config/roles.ts (through assertCan) and only touches their workspace.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@config/auth';
import { PERMISSIONS, ROLES, type GrantOverrides, type Permission, type Role } from '@config/roles';
import { createSession, destroySession, requireUser, signInBlock } from './auth';
import { hashPassword, verifyPassword } from './password';
import { assertCan } from './permissions';
import { accounts, company, newId, offerings, sessions, sources, users, workspaces } from './repo';
import { startBuildProfile, startCheckSources } from './jobs';
import type { Account, Company, OwnerType, Priority, RowStatus, Source, Stage, ValueRow } from './types';

// ---------- form helpers ----------
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
function pick<T extends string>(fd: FormData, key: string, allowed: readonly T[], fallback: T): T {
  const v = text(fd, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
// Only redirect back into this app.
function back(fd: FormData, fallback: string) {
  const r = text(fd, 'returnTo');
  return r && r.startsWith('/') && !r.startsWith('//') ? r : fallback;
}
const flag = (path: string, f: string) => `${path}${path.includes('?') ? '&' : '?'}${f}`;
const refresh = () => revalidatePath('/', 'layout');
const now = () => new Date().toISOString();

// ---------- sign in / out ----------
export async function login(fd: FormData) {
  const email = (text(fd, 'email') ?? '').toLowerCase();
  const user = email ? await users.get(email) : null;
  if (!user || !verifyPassword(text(fd, 'password') ?? '', user.passwordHash)) redirect('/login?error=1');
  const block = signInBlock(user, await workspaces.get(user.workspaceId));
  if (block) redirect(`/login?error=${block}`);
  await users.put({ ...user, lastLoginAt: now() });
  await createSession(user.email);
  redirect(user.isOperator ? '/admin' : '/');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

// ---------- company ----------
const COMPANY_FIELDS = ['website', 'tagline', 'founded', 'location', 'stage', 'headcount', 'whatWeDo', 'whoWeSellTo', 'problem', 'howItWorks', 'whyUs', 'proof'] as const;

export async function updateCompany(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'company.edit', undefined, '/company');
  const existing = await company.get(ctx.workspace.id);
  const c: Company = { name: required(fd, 'name'), createdBy: existing?.createdBy ?? ctx.user.email, updatedBy: ctx.user.email };
  for (const k of COMPANY_FIELDS) c[k] = text(fd, k);
  await company.put(ctx.workspace.id, c);
  refresh();
  redirect('/company?saved=1');
}

// Reads the company sources and drafts the empty profile fields in the background.
export async function buildCompanyProfile() {
  const ctx = await requireUser();
  assertCan(ctx, 'company.edit', undefined, '/company');
  assertCan(ctx, 'jobs.run', undefined, '/company');
  const name = (await company.get(ctx.workspace.id))?.name ?? ctx.workspace.name;
  const job = await startBuildProfile(ctx.workspace.id, ctx.user.email, name);
  refresh();
  redirect(job ? '/company?saved=job' : '/company?error=no-sources');
}

// ---------- sources ----------
const KINDS = ['website', 'drive', 'file', 'link', 'sec', 'calls', 'news'] as const;
const OWNER_TYPES = ['company', 'offering', 'account'] as const;

// Sources follow the rules of what they belong to.
async function assertCanEditSources(ctx: Awaited<ReturnType<typeof requireUser>>, ownerType: OwnerType, ownerId: string, returnTo: string) {
  const wsId = ctx.workspace.id;
  if (ownerType === 'company') {
    if (ownerId !== wsId) throw new Error('Not found');
    assertCan(ctx, 'company.edit', undefined, returnTo);
  } else if (ownerType === 'offering') {
    if (!(await offerings.get(wsId, ownerId))) throw new Error('Not found');
    assertCan(ctx, 'offerings.edit', undefined, returnTo);
  } else {
    const a = await accounts.get(wsId, ownerId);
    if (!a) throw new Error('Not found');
    assertCan(ctx, 'accounts.edit', a, returnTo);
  }
}

export async function addSource(fd: FormData) {
  const ctx = await requireUser();
  const ownerType = pick(fd, 'ownerType', OWNER_TYPES, 'company');
  const ownerId = required(fd, 'ownerId');
  const returnTo = back(fd, '/');
  await assertCanEditSources(ctx, ownerType, ownerId, returnTo);
  const s: Source = {
    id: newId(), ownerType, ownerId,
    kind: pick(fd, 'kind', KINDS, 'link'),
    label: required(fd, 'label'),
    url: text(fd, 'url'),
    mode: pick(fd, 'mode', ['live', 'one-time'] as const, 'one-time'),
    status: 'ready',
    createdAt: now(), createdBy: ctx.user.email, updatedBy: ctx.user.email,
  };
  await sources.put(ctx.workspace.id, s);
  refresh();
  redirect(flag(returnTo, 'saved=source'));
}

export async function deleteSource(fd: FormData) {
  const ctx = await requireUser();
  const ownerType = pick(fd, 'ownerType', OWNER_TYPES, 'company');
  const ownerId = required(fd, 'ownerId');
  const returnTo = back(fd, '/');
  await assertCanEditSources(ctx, ownerType, ownerId, returnTo);
  await sources.remove(ctx.workspace.id, { ownerType, ownerId, id: required(fd, 'id') });
  refresh();
  redirect(flag(returnTo, 'saved=removed'));
}

// ---------- offerings ----------
export async function createOffering(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'offerings.manage', undefined, '/offerings');
  const id = newId();
  await offerings.put(ctx.workspace.id, {
    id, name: required(fd, 'name'), summary: text(fd, 'summary'), whoBuys: text(fd, 'whoBuys'), valueRows: [],
    createdAt: now(), updatedAt: now(), createdBy: ctx.user.email, updatedBy: ctx.user.email,
  });
  refresh();
  redirect(`/offerings/${id}?saved=created`);
}

async function loadOffering(workspaceId: string, id: string) {
  const o = await offerings.get(workspaceId, id);
  if (!o) throw new Error('Not found');
  return o;
}

export async function updateOffering(fd: FormData) {
  const ctx = await requireUser();
  const o = await loadOffering(ctx.workspace.id, required(fd, 'id'));
  assertCan(ctx, 'offerings.edit', undefined, `/offerings/${o.id}`);
  await offerings.put(ctx.workspace.id, { ...o, name: required(fd, 'name'), summary: text(fd, 'summary'), whoBuys: text(fd, 'whoBuys'), updatedBy: ctx.user.email });
  refresh();
  redirect(`/offerings/${o.id}?saved=1`);
}

export async function duplicateOffering(fd: FormData) {
  const ctx = await requireUser();
  const o = await loadOffering(ctx.workspace.id, required(fd, 'id'));
  assertCan(ctx, 'offerings.manage', undefined, `/offerings/${o.id}`);
  const id = newId();
  await offerings.put(ctx.workspace.id, {
    ...o, id, name: `${o.name} (copy)`, createdAt: now(), updatedAt: now(), createdBy: ctx.user.email, updatedBy: ctx.user.email,
    valueRows: o.valueRows.map((r) => ({ ...r, id: newId(), status: 'drafted' as const })),
  });
  refresh();
  redirect(`/offerings/${id}?saved=duplicated`);
}

export async function deleteOffering(fd: FormData) {
  const ctx = await requireUser();
  const id = required(fd, 'id');
  assertCan(ctx, 'offerings.manage', undefined, `/offerings/${id}`);
  await offerings.remove(ctx.workspace.id, id);
  refresh();
  redirect('/offerings?saved=deleted');
}

// ---------- value map rows (stored inside the offering) ----------
const ROW_STATUS = ['drafted', 'reviewed', 'unproven'] as const satisfies readonly RowStatus[];

function rowFields(fd: FormData): Omit<ValueRow, 'id' | 'status'> {
  return { capability: required(fd, 'capability'), outcome: text(fd, 'outcome'), metric: text(fd, 'metric'), proof: text(fd, 'proof') };
}

async function editRows(fd: FormData, change: (rows: ValueRow[]) => ValueRow[], saved: string) {
  const ctx = await requireUser();
  const o = await loadOffering(ctx.workspace.id, required(fd, 'offeringId'));
  assertCan(ctx, 'valuemap.edit', undefined, `/offerings/${o.id}`);
  await offerings.put(ctx.workspace.id, { ...o, valueRows: change(o.valueRows), updatedBy: ctx.user.email });
  refresh();
  redirect(`/offerings/${o.id}?saved=${saved}#value-map`);
}

export async function addValueRow(fd: FormData) {
  await editRows(fd, (rows) => [...rows, { id: newId(), status: 'drafted', ...rowFields(fd) }], 'row');
}

export async function updateValueRow(fd: FormData) {
  const id = required(fd, 'id');
  const status = pick(fd, 'status', ROW_STATUS, 'drafted');
  await editRows(fd, (rows) => rows.map((r) => (r.id === id ? { ...r, ...rowFields(fd), status } : r)), 'row');
}

export async function deleteValueRow(fd: FormData) {
  const id = required(fd, 'id');
  await editRows(fd, (rows) => rows.filter((r) => r.id !== id), 'removed');
}

// ---------- accounts ----------
const PRIORITIES = ['P1', 'P2', 'P3'] as const satisfies readonly Priority[];
const STAGES = ['researching', 'contacted', 'engaged', 'meeting', 'qualified'] as const satisfies readonly Stage[];

function accountFields(fd: FormData) {
  return {
    name: required(fd, 'name'),
    domain: text(fd, 'domain'),
    unit: text(fd, 'unit'),
    industry: text(fd, 'industry'),
    ownership: pick(fd, 'ownership', ['public', 'private'] as const, 'public'),
    ticker: text(fd, 'ticker')?.toUpperCase(),
    priority: pick(fd, 'priority', PRIORITIES, 'P2'),
    stage: pick(fd, 'stage', STAGES, 'researching'),
    notes: text(fd, 'notes'),
  } satisfies Partial<Account>;
}

export async function createAccount(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'accounts.create', undefined, '/accounts');
  const id = newId();
  await accounts.put(ctx.workspace.id, {
    id, ...accountFields(fd), ownerEmail: ctx.user.email, teamEmails: [],
    createdAt: now(), updatedAt: now(), createdBy: ctx.user.email, updatedBy: ctx.user.email,
  });
  refresh();
  redirect(`/accounts/${id}?saved=created`);
}

async function loadAccount(workspaceId: string, id: string) {
  const a = await accounts.get(workspaceId, id);
  if (!a) throw new Error('Not found');
  return a;
}

export async function updateAccount(fd: FormData) {
  const ctx = await requireUser();
  const a = await loadAccount(ctx.workspace.id, required(fd, 'id'));
  assertCan(ctx, 'accounts.edit', a, `/accounts/${a.id}`);
  await accounts.put(ctx.workspace.id, { ...a, ...accountFields(fd), updatedBy: ctx.user.email });
  refresh();
  redirect(`/accounts/${a.id}?saved=1`);
}

// Owner and team. Only people in this workspace can be picked.
export async function assignAccount(fd: FormData) {
  const ctx = await requireUser();
  const a = await loadAccount(ctx.workspace.id, required(fd, 'id'));
  assertCan(ctx, 'accounts.assign', a, `/accounts/${a.id}`);
  const memberEmails = new Set((await users.list(ctx.workspace.id)).map((u) => u.email));
  const owner = text(fd, 'ownerEmail');
  const team = fd.getAll('teamEmails').map(String).filter((e) => memberEmails.has(e) && e !== owner);
  await accounts.put(ctx.workspace.id, {
    ...a,
    ownerEmail: owner && memberEmails.has(owner) ? owner : undefined,
    teamEmails: [...new Set(team)],
    updatedBy: ctx.user.email,
  });
  refresh();
  redirect(`/accounts/${a.id}?saved=team`);
}

export async function deleteAccount(fd: FormData) {
  const ctx = await requireUser();
  const a = await loadAccount(ctx.workspace.id, required(fd, 'id'));
  assertCan(ctx, 'accounts.delete', a, `/accounts/${a.id}`);
  await accounts.remove(ctx.workspace.id, a.id);
  refresh();
  redirect('/accounts?saved=deleted');
}

// ---------- background jobs ----------
export async function checkAccountSources(fd: FormData) {
  const ctx = await requireUser();
  const a = await loadAccount(ctx.workspace.id, required(fd, 'accountId'));
  assertCan(ctx, 'jobs.run', a, `/accounts/${a.id}`);
  const started = await startCheckSources(ctx.workspace.id, ctx.user.email, a);
  refresh();
  redirect(`/accounts/${a.id}?${started ? 'saved=job' : 'error=no-sources'}`);
}

// ---------- your profile ----------
// The real signed-in account (an operator working inside an org edits their own profile, not a copy).
async function me() {
  const ctx = await requireUser();
  return ctx.operator ?? ctx.user;
}

export async function updateProfile(fd: FormData) {
  const user = await me();
  await users.put({ ...user, name: required(fd, 'name') });
  refresh();
  redirect('/settings?saved=1');
}

export async function changePassword(fd: FormData) {
  const user = await me();
  if (!verifyPassword(text(fd, 'current') ?? '', user.passwordHash)) redirect('/settings?error=wrong-password');
  const next = text(fd, 'next') ?? '';
  if (next.length < auth.minPasswordLength) redirect('/settings?error=short-password');
  await users.put({ ...user, passwordHash: hashPassword(next) });
  redirect('/settings?saved=password');
}

// ---------- members (admins) ----------
const ROLE_KEYS = Object.keys(ROLES) as Role[];

async function adminCount(workspaceId: string) {
  return (await users.list(workspaceId)).filter((u) => u.role === 'admin').length;
}

export async function addMember(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'members.manage', undefined, '/settings/members');
  const email = required(fd, 'email').toLowerCase();
  const password = required(fd, 'password');
  if (password.length < auth.minPasswordLength) redirect('/settings/members?error=short-password');
  const existing = await users.get(email);
  if (existing) redirect(`/settings/members?error=${existing.workspaceId === ctx.workspace.id ? 'member-exists' : 'email-taken'}`);
  await users.put({
    email, name: required(fd, 'name'), role: pick(fd, 'role', ROLE_KEYS, 'member'),
    passwordHash: hashPassword(password), workspaceId: ctx.workspace.id, createdAt: now(),
  });
  redirect('/settings/members?saved=member');
}

export async function changeRole(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'members.manage', undefined, '/settings/members');
  const email = required(fd, 'email');
  const role = pick(fd, 'role', ROLE_KEYS, 'member');
  const target = await users.get(email);
  if (!target || target.workspaceId !== ctx.workspace.id) throw new Error('Not found');
  if (target.email === ctx.user.email) redirect('/settings/members?error=self-role');
  if (target.role === 'admin' && role !== 'admin' && (await adminCount(ctx.workspace.id)) <= 1) redirect('/settings/members?error=last-admin');
  await users.put({ ...target, role });
  redirect('/settings/members?saved=role');
}

export async function resetMemberPassword(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'members.manage', undefined, '/settings/members');
  const target = await users.get(required(fd, 'email'));
  if (!target || target.workspaceId !== ctx.workspace.id) throw new Error('Not found');
  const password = required(fd, 'password');
  if (password.length < auth.minPasswordLength) redirect('/settings/members?error=short-password');
  await users.put({ ...target, passwordHash: hashPassword(password) });
  redirect('/settings/members?saved=password-reset');
}

// Removes a member. Accounts they owned move to the admin who removed them; they leave every account team.
export async function removeMember(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'members.manage', undefined, '/settings/members');
  const target = await users.get(required(fd, 'email'));
  if (!target || target.workspaceId !== ctx.workspace.id) throw new Error('Not found');
  if (target.email === ctx.user.email) redirect('/settings/members?error=self-remove');
  if (target.role === 'admin' && (await adminCount(ctx.workspace.id)) <= 1) redirect('/settings/members?error=last-admin');
  // An operator working inside the org isn't a member, so their accounts go to the org's first admin instead.
  const heir = ctx.operator
    ? (await users.list(ctx.workspace.id)).filter((u) => u.role === 'admin' && u.email !== target.email).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.email
    : ctx.user.email;
  for (const a of await accounts.list(ctx.workspace.id)) {
    const onTeam = (a.teamEmails ?? []).includes(target.email);
    if (a.ownerEmail === target.email || onTeam) {
      await accounts.put(ctx.workspace.id, {
        ...a,
        ownerEmail: a.ownerEmail === target.email ? heir : a.ownerEmail,
        teamEmails: (a.teamEmails ?? []).filter((e) => e !== target.email),
        updatedBy: ctx.user.email,
      });
    }
  }
  await users.remove(target.email);
  await sessions.removeFor(target.email);
  refresh();
  redirect('/settings/members?saved=removed');
}

// ---------- workspace (admins) ----------
export async function renameWorkspace(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'workspace.settings', undefined, '/settings/workspace');
  await workspaces.update({ ...ctx.workspace, name: required(fd, 'name') });
  refresh();
  redirect('/settings/workspace?saved=1');
}

// Saves the adjustable rules from Settings › Roles. Fields are named `<permission>:<role>`.
export async function updateRoleRules(fd: FormData) {
  const ctx = await requireUser();
  assertCan(ctx, 'workspace.settings', undefined, '/settings/roles');
  const grants: GrantOverrides = {};
  for (const [perm, rule] of Object.entries(PERMISSIONS) as [Permission, (typeof PERMISSIONS)[Permission]][]) {
    if (!('adjustable' in rule) || !rule.adjustable) continue;
    for (const role of ['member', 'viewer'] as const) {
      const v = text(fd, `${perm}:${role}`);
      if (v !== 'any' && v !== 'own' && v !== 'none') continue;
      const base = (rule.grants as Partial<Record<Role, string>>)[role] ?? 'none';
      if (v === base) continue; // same as the default: store nothing
      grants[perm] = { ...grants[perm], [role]: v };
    }
  }
  await workspaces.update({ ...ctx.workspace, grants });
  refresh();
  redirect('/settings/roles?saved=rules');
}

export async function resetRoleRules() {
  const ctx = await requireUser();
  assertCan(ctx, 'workspace.settings', undefined, '/settings/roles');
  await workspaces.update({ ...ctx.workspace, grants: {} });
  refresh();
  redirect('/settings/roles?saved=reset');
}
