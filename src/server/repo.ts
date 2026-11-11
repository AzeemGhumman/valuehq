// Data access for the single DynamoDB table.
//
// Keys (PK / SK):
//   USER#<email>        / PROFILE                    user (GSI1: WS#<ws> / USER#<email>)
//   SESSION#<hash>      / SESSION                    session (expires through the `ttl` attribute)
//   WS#<ws>             / META                       workspace
//   WS#<ws>             / COMPANY                    the seller's company profile
//   WS#<ws>             / OFFERING#<id>              offering, with its value map rows inside
//   WS#<ws>             / ACCOUNT#<id>               account
//   WS#<ws>             / SOURCE#<owner>#<ownerId>#<id>   source of the company, an offering or an account
//   WS#<ws>             / JOB#<id>                   background job (ids sort by time, newest last)
import { randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './db';
import type { Account, Company, Job, JobStep, Offering, OwnerType, Session, Source, User, Workspace } from './types';

const ws = (id: string) => `WS#${id}`;
const now = () => new Date().toISOString();
export const newId = () => randomUUID();
// Time-ordered id for jobs: base36 milliseconds + random suffix.
export const timeId = () => `${Date.now().toString(36).padStart(10, '0')}-${randomUUID().slice(0, 8)}`;

type Item = Record<string, unknown>;
function strip<T>(item: Item | undefined): T | null {
  if (!item) return null;
  const { PK, SK, GSI1PK, GSI1SK, type, ttl, ...rest } = item;
  void PK; void SK; void GSI1PK; void GSI1SK; void type; void ttl;
  return rest as T;
}
async function get<T>(PK: string, SK: string) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK, SK } }));
  return strip<T>(r.Item);
}
async function put(item: Item) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}
async function del(PK: string, SK: string) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK, SK } }));
}
async function query<T>(PK: string, prefix: string, newestFirst = false): Promise<T[]> {
  const out: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': PK, ':sk': prefix },
      ScanIndexForward: !newestFirst,
      ExclusiveStartKey,
    }));
    for (const i of r.Items ?? []) out.push(strip<T>(i) as T);
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

// ---------- users and sessions ----------
export const users = {
  get: (email: string) => get<User>(`USER#${email.toLowerCase()}`, 'PROFILE'),
  put: (u: User) => put({ PK: `USER#${u.email}`, SK: 'PROFILE', GSI1PK: ws(u.workspaceId), GSI1SK: `USER#${u.email}`, type: 'user', ...u }),
  remove: (email: string) => del(`USER#${email.toLowerCase()}`, 'PROFILE'),
  async list(workspaceId: string) {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: { ':pk': ws(workspaceId), ':sk': 'USER#' },
    }));
    return (r.Items ?? []).map((i) => strip<User>(i) as User);
  },
};

export const sessions = {
  get: (id: string) => get<Session>(`SESSION#${id}`, 'SESSION'),
  // Signs a user out everywhere (used when they're disabled, removed or their email changes).
  async removeFor(email: string) {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, FilterExpression: '#t = :t AND email = :e', ExpressionAttributeNames: { '#t': 'type' }, ExpressionAttributeValues: { ':t': 'session', ':e': email }, ProjectionExpression: 'PK, SK' }));
    for (const i of r.Items ?? []) await del(i.PK as string, i.SK as string);
  },
  put: (s: Session) => put({ PK: `SESSION#${s.id}`, SK: 'SESSION', type: 'session', ttl: Math.floor(new Date(s.expiresAt).getTime() / 1000), ...s }),
  remove: (id: string) => del(`SESSION#${id}`, 'SESSION'),
};

// ---------- workspaces ----------
export const workspaces = {
  get: (id: string) => get<Workspace>(ws(id), 'META'),
  async create(name: string, extra: Partial<Pick<Workspace, 'kind' | 'createdBy'>> = {}) {
    const w: Workspace = { id: newId(), name, createdAt: now(), status: 'active', kind: 'customer', ...extra };
    await put({ PK: ws(w.id), SK: 'META', type: 'workspace', ...w });
    return w;
  },
  async update(w: Workspace) {
    await put({ PK: ws(w.id), SK: 'META', type: 'workspace', ...w });
  },
  // Every workspace. Used by the admin console and the command-line scripts (a scan: fine for hundreds of orgs).
  async list() {
    const out: Workspace[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const r = await ddb.send(new ScanCommand({ TableName: TABLE, FilterExpression: 'SK = :m', ExpressionAttributeValues: { ':m': 'META' }, ExclusiveStartKey }));
      for (const i of r.Items ?? []) out.push(strip<Workspace>(i) as Workspace);
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  // The ValueHQ team's own workspace, created on first use.
  async internal(): Promise<Workspace> {
    const found = (await this.list()).find((w) => w.kind === 'internal');
    return found ?? (await this.create('ValueHQ Platform', { kind: 'internal' }));
  },
  // Deletes the workspace, its data and its users.
  async remove(id: string) {
    await clearWorkspaceData(id);
    for (const u of await users.list(id)) { await sessions.removeFor(u.email); await users.remove(u.email); }
    await del(ws(id), 'META');
  },
};

// Deletes the company profile, offerings, accounts, sources and jobs of a workspace. Users stay.
export async function clearWorkspaceData(workspaceId: string) {
  for (const prefix of ['COMPANY', 'OFFERING#', 'ACCOUNT#', 'SOURCE#', 'JOB#']) {
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: TABLE, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': ws(workspaceId), ':sk': prefix }, ProjectionExpression: 'PK, SK', ExclusiveStartKey,
      }));
      for (const i of r.Items ?? []) await del(i.PK as string, i.SK as string);
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
}

// ---------- company ----------
export const company = {
  get: (workspaceId: string) => get<Company>(ws(workspaceId), 'COMPANY'),
  put: (workspaceId: string, c: Company) => put({ PK: ws(workspaceId), SK: 'COMPANY', type: 'company', ...c, updatedAt: now() }),
};

// ---------- offerings ----------
export const offerings = {
  list: (workspaceId: string) => query<Offering>(ws(workspaceId), 'OFFERING#').then((l) => l.sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
  get: (workspaceId: string, id: string) => get<Offering>(ws(workspaceId), `OFFERING#${id}`),
  put: (workspaceId: string, o: Offering) => put({ PK: ws(workspaceId), SK: `OFFERING#${o.id}`, type: 'offering', ...o, updatedAt: now() }),
  async remove(workspaceId: string, id: string) {
    await del(ws(workspaceId), `OFFERING#${id}`);
    for (const s of await sources.list(workspaceId, 'offering', id)) await sources.remove(workspaceId, s);
  },
};

// ---------- accounts ----------
export const accounts = {
  list: (workspaceId: string) => query<Account>(ws(workspaceId), 'ACCOUNT#'),
  get: (workspaceId: string, id: string) => get<Account>(ws(workspaceId), `ACCOUNT#${id}`),
  put: (workspaceId: string, a: Account) => put({ PK: ws(workspaceId), SK: `ACCOUNT#${a.id}`, type: 'account', ...a, updatedAt: now() }),
  async remove(workspaceId: string, id: string) {
    await del(ws(workspaceId), `ACCOUNT#${id}`);
    for (const s of await sources.list(workspaceId, 'account', id)) await sources.remove(workspaceId, s);
  },
};

// ---------- sources ----------
const sourceSK = (s: Pick<Source, 'ownerType' | 'ownerId' | 'id'>) => `SOURCE#${s.ownerType}#${s.ownerId}#${s.id}`;
export const sources = {
  list: (workspaceId: string, ownerType: OwnerType, ownerId: string) => query<Source>(ws(workspaceId), `SOURCE#${ownerType}#${ownerId}#`).then((l) => l.sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
  listAll: (workspaceId: string) => query<Source>(ws(workspaceId), 'SOURCE#'),
  put: (workspaceId: string, s: Source) => put({ PK: ws(workspaceId), SK: sourceSK(s), type: 'source', ...s }),
  remove: (workspaceId: string, s: Pick<Source, 'ownerType' | 'ownerId' | 'id'>) => del(ws(workspaceId), sourceSK(s)),
  async setStatus(workspaceId: string, s: Pick<Source, 'ownerType' | 'ownerId' | 'id'>, status: Source['status'], note?: string) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { PK: ws(workspaceId), SK: sourceSK(s) },
      UpdateExpression: 'SET #st = :st, note = :note, lastCheckedAt = :at',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':st': status, ':note': note ?? null, ':at': now() },
    }));
  },
};

// ---------- background jobs ----------
export const jobsRepo = {
  list: (workspaceId: string) => query<Job>(ws(workspaceId), 'JOB#', true),
  get: (workspaceId: string, id: string) => get<Job>(ws(workspaceId), `JOB#${id}`),
  put: (j: Job) => put({ PK: ws(j.workspaceId), SK: `JOB#${j.id}`, type: 'job', ...j }),
  // Update top-level fields of a job.
  async patch(workspaceId: string, id: string, fields: Partial<Pick<Job, 'status' | 'error' | 'finishedAt' | 'executionArn'>>) {
    const entries = Object.entries({ ...fields, updatedAt: now() });
    await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { PK: ws(workspaceId), SK: `JOB#${id}` },
      UpdateExpression: 'SET ' + entries.map((_, i) => `#k${i} = :v${i}`).join(', '),
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v ?? null])),
    }));
  },
  // Update one step in place. Safe to call from parallel workers: each touches only its own step.
  async setStep(workspaceId: string, id: string, index: number, step: Partial<JobStep>, countDone = false) {
    const names: Record<string, string> = { '#steps': 'steps', '#u': 'updatedAt' };
    const values: Record<string, unknown> = { ':u': now() };
    const sets = ['#u = :u'];
    for (const [k, v] of Object.entries(step)) {
      names[`#${k}`] = k;
      values[`:${k}`] = v ?? null;
      sets.push(`#steps[${index}].#${k} = :${k}`);
    }
    let expr = 'SET ' + sets.join(', ');
    if (countDone) { expr += ' ADD doneCount :one'; values[':one'] = 1; }
    await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { PK: ws(workspaceId), SK: `JOB#${id}` },
      UpdateExpression: expr, ExpressionAttributeNames: names, ExpressionAttributeValues: values,
    }));
  },
};
