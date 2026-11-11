// Shapes stored in DynamoDB (one table, see src/server/repo.ts for keys).
export type Role = 'admin' | 'member';

export interface User { email: string; name: string; passwordHash: string; role: Role; workspaceId: string; createdAt: string }
export interface Session { id: string; email: string; expiresAt: string }
export interface Workspace { id: string; name: string; createdAt: string }

export interface Company {
  name: string; website?: string; tagline?: string; founded?: string; location?: string; stage?: string; headcount?: string;
  whatWeDo?: string; whoWeSellTo?: string; problem?: string; howItWorks?: string; whyUs?: string; proof?: string;
  updatedAt?: string;
}

export type RowStatus = 'drafted' | 'reviewed' | 'unproven';
export interface ValueRow { id: string; capability: string; outcome?: string; metric?: string; proof?: string; status: RowStatus }
export interface Offering { id: string; name: string; summary?: string; whoBuys?: string; valueRows: ValueRow[]; createdAt: string; updatedAt: string }

export type Priority = 'P1' | 'P2' | 'P3';
export type Stage = 'researching' | 'contacted' | 'engaged' | 'meeting' | 'qualified';
export interface Account {
  id: string; name: string; domain?: string; unit?: string; industry?: string; ownership: 'public' | 'private'; ticker?: string;
  priority: Priority; stage: Stage; notes?: string; createdAt: string; updatedAt: string;
}

export type OwnerType = 'company' | 'offering' | 'account';
export type SourceStatus = 'ready' | 'processing' | 'needs-help';
export interface Source {
  id: string; ownerType: OwnerType; ownerId: string; kind: string; label: string; url?: string;
  mode: 'live' | 'one-time'; status: SourceStatus; note?: string; lastCheckedAt?: string; createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'needs-help' | 'done' | 'failed';
export type StepStatus = 'waiting' | 'running' | 'done' | 'needs-help' | 'failed';
export interface JobStep { name: string; status: StepStatus; detail?: string }
export interface Job {
  id: string; workspaceId: string; type: 'check-sources'; title: string; status: JobStatus;
  accountId?: string; steps: JobStep[]; doneCount: number; totalCount: number;
  createdBy: string; createdAt: string; updatedAt: string; finishedAt?: string; executionArn?: string; error?: string;
}
