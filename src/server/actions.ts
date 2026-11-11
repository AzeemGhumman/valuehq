'use server';

// Every create, update and delete in the app. Each action checks the signed-in user and only touches their workspace.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@config/auth';
import { createSession, destroySession, requireUser } from './auth';
import { hashPassword, verifyPassword } from './password';
import { accounts, company, newId, offerings, sources, users } from './repo';
import { startCheckSources } from './jobs';
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
  await createSession(user.email);
  redirect('/');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

// ---------- company ----------
const COMPANY_FIELDS = ['website', 'tagline', 'founded', 'location', 'stage', 'headcount', 'whatWeDo', 'whoWeSellTo', 'problem', 'howItWorks', 'whyUs', 'proof'] as const;

export async function updateCompany(fd: FormData) {
  const { workspace } = await requireUser();
  const c: Company = { name: required(fd, 'name') };
  for (const k of COMPANY_FIELDS) c[k] = text(fd, k);
  await company.put(workspace.id, c);
  refresh();
  redirect('/company?saved=1');
}

// ---------- sources ----------
const KINDS = ['website', 'drive', 'file', 'link', 'sec', 'calls', 'news'] as const;

async function ownerExists(workspaceId: string, ownerType: OwnerType, ownerId: string) {
  if (ownerType === 'company') return ownerId === workspaceId;
  if (ownerType === 'offering') return !!(await offerings.get(workspaceId, ownerId));
  return !!(await accounts.get(workspaceId, ownerId));
}

export async function addSource(fd: FormData) {
  const { workspace } = await requireUser();
  const ownerType = pick(fd, 'ownerType', ['company', 'offering', 'account'] as const, 'company');
  const ownerId = required(fd, 'ownerId');
  if (!(await ownerExists(workspace.id, ownerType, ownerId))) throw new Error('Not found');
  const s: Source = {
    id: newId(), ownerType, ownerId,
    kind: pick(fd, 'kind', KINDS, 'link'),
    label: required(fd, 'label'),
    url: text(fd, 'url'),
    mode: pick(fd, 'mode', ['live', 'one-time'] as const, 'one-time'),
    status: 'ready',
    createdAt: now(),
  };
  await sources.put(workspace.id, s);
  refresh();
  redirect(flag(back(fd, '/'), 'saved=source'));
}

export async function deleteSource(fd: FormData) {
  const { workspace } = await requireUser();
  await sources.remove(workspace.id, {
    ownerType: pick(fd, 'ownerType', ['company', 'offering', 'account'] as const, 'company'),
    ownerId: required(fd, 'ownerId'),
    id: required(fd, 'id'),
  });
  refresh();
  redirect(flag(back(fd, '/'), 'saved=removed'));
}

// ---------- offerings ----------
export async function createOffering(fd: FormData) {
  const { workspace } = await requireUser();
  const id = newId();
  await offerings.put(workspace.id, { id, name: required(fd, 'name'), summary: text(fd, 'summary'), whoBuys: text(fd, 'whoBuys'), valueRows: [], createdAt: now(), updatedAt: now() });
  refresh();
  redirect(`/offerings/${id}?saved=created`);
}

async function loadOffering(workspaceId: string, id: string) {
  const o = await offerings.get(workspaceId, id);
  if (!o) throw new Error('Not found');
  return o;
}

export async function updateOffering(fd: FormData) {
  const { workspace } = await requireUser();
  const o = await loadOffering(workspace.id, required(fd, 'id'));
  await offerings.put(workspace.id, { ...o, name: required(fd, 'name'), summary: text(fd, 'summary'), whoBuys: text(fd, 'whoBuys') });
  refresh();
  redirect(`/offerings/${o.id}?saved=1`);
}

export async function duplicateOffering(fd: FormData) {
  const { workspace } = await requireUser();
  const o = await loadOffering(workspace.id, required(fd, 'id'));
  const id = newId();
  await offerings.put(workspace.id, {
    ...o, id, name: `${o.name} (copy)`, createdAt: now(), updatedAt: now(),
    valueRows: o.valueRows.map((r) => ({ ...r, id: newId(), status: 'drafted' as const })),
  });
  refresh();
  redirect(`/offerings/${id}?saved=duplicated`);
}

export async function deleteOffering(fd: FormData) {
  const { workspace } = await requireUser();
  await offerings.remove(workspace.id, required(fd, 'id'));
  refresh();
  redirect('/offerings?saved=deleted');
}

// ---------- value map rows (stored inside the offering) ----------
const ROW_STATUS = ['drafted', 'reviewed', 'unproven'] as const satisfies readonly RowStatus[];

function rowFields(fd: FormData): Omit<ValueRow, 'id' | 'status'> {
  return { capability: required(fd, 'capability'), outcome: text(fd, 'outcome'), metric: text(fd, 'metric'), proof: text(fd, 'proof') };
}

export async function addValueRow(fd: FormData) {
  const { workspace } = await requireUser();
  const o = await loadOffering(workspace.id, required(fd, 'offeringId'));
  await offerings.put(workspace.id, { ...o, valueRows: [...o.valueRows, { id: newId(), status: 'drafted', ...rowFields(fd) }] });
  refresh();
  redirect(`/offerings/${o.id}?saved=row#value-map`);
}

export async function updateValueRow(fd: FormData) {
  const { workspace } = await requireUser();
  const o = await loadOffering(workspace.id, required(fd, 'offeringId'));
  const id = required(fd, 'id');
  const status = pick(fd, 'status', ROW_STATUS, 'drafted');
  await offerings.put(workspace.id, { ...o, valueRows: o.valueRows.map((r) => (r.id === id ? { ...r, ...rowFields(fd), status } : r)) });
  refresh();
  redirect(`/offerings/${o.id}?saved=row#value-map`);
}

export async function deleteValueRow(fd: FormData) {
  const { workspace } = await requireUser();
  const o = await loadOffering(workspace.id, required(fd, 'offeringId'));
  const id = required(fd, 'id');
  await offerings.put(workspace.id, { ...o, valueRows: o.valueRows.filter((r) => r.id !== id) });
  refresh();
  redirect(`/offerings/${o.id}?saved=removed#value-map`);
}

// ---------- accounts ----------
const PRIORITIES = ['P1', 'P2', 'P3'] as const satisfies readonly Priority[];
const STAGES = ['researching', 'contacted', 'engaged', 'meeting', 'qualified'] as const satisfies readonly Stage[];

function accountFields(fd: FormData): Omit<Account, 'id' | 'createdAt' | 'updatedAt'> {
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
  };
}

export async function createAccount(fd: FormData) {
  const { workspace } = await requireUser();
  const id = newId();
  await accounts.put(workspace.id, { id, ...accountFields(fd), createdAt: now(), updatedAt: now() });
  refresh();
  redirect(`/accounts/${id}?saved=created`);
}

export async function updateAccount(fd: FormData) {
  const { workspace } = await requireUser();
  const a = await accounts.get(workspace.id, required(fd, 'id'));
  if (!a) throw new Error('Not found');
  await accounts.put(workspace.id, { ...a, ...accountFields(fd) });
  refresh();
  redirect(`/accounts/${a.id}?saved=1`);
}

export async function deleteAccount(fd: FormData) {
  const { workspace } = await requireUser();
  await accounts.remove(workspace.id, required(fd, 'id'));
  refresh();
  redirect('/accounts?saved=deleted');
}

// ---------- background jobs ----------
export async function checkAccountSources(fd: FormData) {
  const { user, workspace } = await requireUser();
  const a = await accounts.get(workspace.id, required(fd, 'accountId'));
  if (!a) throw new Error('Not found');
  const started = await startCheckSources(workspace.id, user.email, a);
  refresh();
  redirect(`/accounts/${a.id}?${started ? 'saved=job' : 'error=no-sources'}`);
}

// ---------- your profile ----------
export async function updateProfile(fd: FormData) {
  const { user } = await requireUser();
  await users.put({ ...user, name: required(fd, 'name') });
  refresh();
  redirect('/settings?saved=1');
}

export async function changePassword(fd: FormData) {
  const { user } = await requireUser();
  if (!verifyPassword(text(fd, 'current') ?? '', user.passwordHash)) redirect('/settings?error=wrong-password');
  const next = text(fd, 'next') ?? '';
  if (next.length < auth.minPasswordLength) redirect('/settings?error=short-password');
  await users.put({ ...user, passwordHash: hashPassword(next) });
  redirect('/settings?saved=password');
}
