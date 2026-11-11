// Shapes stored in DynamoDB (one table, see src/server/repo.ts for keys).
import type { GrantOverrides, Role } from '@config/roles';
export type { Role };

// Who created or last changed a record (email).
export interface Audit { createdBy?: string; updatedBy?: string }

export interface User {
  email: string; name: string; passwordHash: string; role: Role; workspaceId: string; createdAt: string;
  // Platform operators (the ValueHQ team) get the admin console at /admin. See config/roles.ts.
  isOperator?: boolean;
  // Disabled users can't sign in. Their data stays.
  disabled?: boolean;
  lastLoginAt?: string;
}
// actingWorkspaceId: an operator who switched into a customer org works there as an admin.
export interface Session { id: string; email: string; expiresAt: string; actingWorkspaceId?: string }
export type WorkspaceStatus = 'active' | 'disabled';
export interface Workspace {
  id: string; name: string; createdAt: string; grants?: GrantOverrides;
  // 'internal' is the ValueHQ team's own workspace; customers are 'customer' (the default).
  kind?: 'internal' | 'customer';
  // Nobody in a disabled org can sign in (operators still can, to look around).
  status?: WorkspaceStatus;
  createdBy?: string;
}

export interface Company extends Audit {
  name: string; website?: string; tagline?: string; founded?: string; location?: string; stage?: string; headcount?: string;
  whatWeDo?: string; whoWeSellTo?: string; problem?: string; howItWorks?: string; whyUs?: string; proof?: string;
  updatedAt?: string;
}

export type RowStatus = 'drafted' | 'reviewed' | 'unproven';
export interface ValueRow { id: string; capability: string; outcome?: string; metric?: string; proof?: string; status: RowStatus }
export interface Offering extends Audit { id: string; name: string; summary?: string; whoBuys?: string; valueRows: ValueRow[]; createdAt: string; updatedAt: string }

export type Priority = 'P1' | 'P2' | 'P3';
export type Stage = 'researching' | 'contacted' | 'engaged' | 'meeting' | 'qualified';
export interface Account extends Audit {
  id: string; name: string; domain?: string; unit?: string; industry?: string; ownership: 'public' | 'private'; ticker?: string;
  priority: Priority; stage: Stage; notes?: string; createdAt: string; updatedAt: string;
  // Account owner and team (emails). Members with 'own' scope can act on these accounts.
  ownerEmail?: string; teamEmails?: string[];
}

export type OwnerType = 'company' | 'offering' | 'account';
export type SourceStatus = 'ready' | 'processing' | 'needs-help';
export interface Source extends Audit {
  id: string; ownerType: OwnerType; ownerId: string; kind: string; label: string; url?: string;
  mode: 'live' | 'one-time'; status: SourceStatus; note?: string; lastCheckedAt?: string; createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'needs-help' | 'done' | 'failed';
export type StepStatus = 'waiting' | 'running' | 'done' | 'needs-help' | 'failed';
// check-sources: checks an account's links. build-profile: reads the company's website and sources
// and drafts the empty fields of the company profile.
export type JobType = 'check-sources' | 'build-profile';
export interface JobStep { name: string; status: StepStatus; detail?: string }
export interface Job {
  id: string; workspaceId: string; jobType: JobType; title: string; status: JobStatus;
  accountId?: string; steps: JobStep[]; doneCount: number; totalCount: number;
  createdBy: string; createdAt: string; updatedAt: string; finishedAt?: string; executionArn?: string; error?: string;
}
