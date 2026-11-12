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
  whatWeDo?: string; whoWeSellTo?: string; problem?: string; howItWorks?: string; whyUs?: string; proof?: string; pricing?: string;
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
// check-sources: checks an account's links. build-profile: quick in-app read of the company's links.
// ingest-website: the workers crawl the whole site into S3 and summarize it with Claude (infra/workers.yaml).
export type JobType = 'check-sources' | 'build-profile' | 'ingest-website';
export interface JobStep { name: string; status: StepStatus; detail?: string }
export interface Job {
  id: string; workspaceId: string; jobType: JobType; title: string; status: JobStatus;
  accountId?: string; steps: JobStep[]; doneCount: number; totalCount: number;
  createdBy: string; createdAt: string; updatedAt: string; finishedAt?: string; executionArn?: string; error?: string;
  // Written by the workers (workers/valuehq_workers): crawl report summary and analysis summary.
  report?: CrawlReport; analysis?: AnalysisSummary;
  // ingest-website: the settings it ran with, so an operator can re-run it.
  crawl?: CrawlOptions; analyze?: boolean;
}

export interface CrawlFailure { url: string; reason: string; httpStatus?: number | null; attempts?: number; error?: string }
export interface CrawlReport {
  crawlId: string; host: string; mode: 'full' | 'partial'; durationSeconds: number;
  attempted: number; ok: number; unchanged: number; failed: number; pages: number; files: number; carried: number;
  successRate: number; pageLimit: number; pageLimitReached: boolean;
  failuresByReason: Record<string, number>; skippedByReason: Record<string, number>; failures: CrawlFailure[]; location: string;
}
export interface AnalysisSummary {
  name: string; promptVersion: string; model: string; pages: number; pricingModel?: string; filled: string[]; gaps: string[];
  inputTokens: number; outputTokens: number; location: string;
}

// Options for a website crawl, as the workers expect them (workers/valuehq_workers/crawl/config.py).
export interface CrawlOptions {
  start_url: string; include?: string[]; exclude?: string[]; scope?: string[];
  max_pages?: number; max_depth?: number; strategy?: 'bfs' | 'dfs'; render_js?: boolean;
  urls?: string[]; follow_links?: boolean;   // re-crawl exactly these pages
}

// Cost snapshot written daily by the workers (workers/valuehq_workers/costs/run.py). Amounts in USD.
export interface CostMonth { month: string; total: number; byService?: Record<string, number>; byEnv?: Record<string, number>; byModel?: Record<string, number> }
export interface CostDay { date: string; amount: number }
export interface OrgCost {
  id: string; name: string; fargate: number; anthropic: number; total: number;
  usage: { crawls: number; crawlSeconds: number; pages: number; inputTokens: number; outputTokens: number };
}
export interface CostSnapshot {
  generatedAt: string; env: string; month: string;
  aws: { error?: string; tag?: string; months?: CostMonth[]; daily?: CostDay[]; forecastMonthEnd?: number | null; noTaggedData?: boolean };
  anthropic: { error?: string; workspace?: string; months?: CostMonth[]; daily?: CostDay[] };
  orgs: OrgCost[];
}
