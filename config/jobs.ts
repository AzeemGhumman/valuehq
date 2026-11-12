import { aws } from './aws';

// Background jobs. In AWS they run on Step Functions; locally they run inside the dev server.
export const jobs = {
  runner: aws.stateMachineArn ? ('stepfunctions' as const) : ('inline' as const),
  // Website ingestion (crawl + Claude summary) runs in the separate workers stack (infra/workers.yaml).
  // Unset locally: provisioning then falls back to the quick in-app profile job.
  websiteIngestArn: process.env.WEBSITE_INGEST_STATE_MACHINE_ARN || undefined,
  // Daily cost snapshot (workers stack); operators can also run it from Admin › Costs.
  costsArn: process.env.COSTS_STATE_MACHINE_ARN || undefined,
  // How often the Background jobs page refreshes while a job is running.
  pollMs: 3000,
  // Pause per step in the demo job so progress is visible.
  demoStepDelayMs: Number(process.env.JOB_DEMO_DELAY_MS ?? 1500),
  // Timeout when checking that a source link responds.
  fetchTimeoutMs: 8000,
} as const;
