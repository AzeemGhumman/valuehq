// Loads a sample profile (scripts/seed-profiles) into a workspace, replacing its company, offerings,
// accounts, sources and jobs. Members stay. Used by `npm run seed` and the admin console.
import { PROFILES } from '../../scripts/seed-profiles';
import type { SeedProfile, SourceSeed } from '../../scripts/seed-profiles/types';
import { accounts, clearWorkspaceData, company, newId, offerings, sources, users } from './repo';

export { PROFILES };
export type { SeedProfile };

// Accounts are owned by `ownerEmail`, or the workspace's first admin.
export async function loadProfile(workspaceId: string, key: string, ownerEmail?: string) {
  const profile = PROFILES[key];
  if (!profile) throw new Error(`No profile "${key}". Available: ${Object.keys(PROFILES).join(', ')}`);
  let owner = ownerEmail;
  if (!owner) {
    const members = await users.list(workspaceId);
    owner = (members.filter((m) => m.role === 'admin').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? members[0])?.email;
  }
  const by = owner ?? 'seed';
  const now = new Date().toISOString();
  const addSources = (ownerType: 'company' | 'offering' | 'account', ownerId: string, list: SourceSeed[]) =>
    Promise.all(list.map((s) => sources.put(workspaceId, { id: newId(), ownerType, ownerId, mode: 'one-time', status: 'ready', createdAt: now, createdBy: by, updatedBy: by, ...s })));

  await clearWorkspaceData(workspaceId);
  await company.put(workspaceId, { ...profile.company, createdBy: by, updatedBy: by });
  await addSources('company', workspaceId, profile.companySources);
  for (const o of profile.offerings) {
    const id = newId();
    const { sources: src, valueRows, ...fields } = o;
    await offerings.put(workspaceId, { id, ...fields, valueRows: valueRows.map((r) => ({ id: newId(), ...r })), createdAt: now, updatedAt: now, createdBy: by, updatedBy: by });
    await addSources('offering', id, src);
  }
  for (const a of profile.accounts) {
    const id = newId();
    const { sources: src, ...fields } = a;
    await accounts.put(workspaceId, { id, ...fields, ownerEmail: owner, teamEmails: [], createdAt: now, updatedAt: now, createdBy: by, updatedBy: by });
    await addSources('account', id, src);
  }
  return { profile, owner };
}
