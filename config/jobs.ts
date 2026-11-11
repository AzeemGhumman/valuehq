import { aws } from './aws';

// Background jobs. In AWS they run on Step Functions; locally they run inside the dev server.
export const jobs = {
  runner: aws.stateMachineArn ? ('stepfunctions' as const) : ('inline' as const),
  // How often the Background jobs page refreshes while a job is running.
  pollMs: 3000,
  // Pause per step in the demo job so progress is visible.
  demoStepDelayMs: Number(process.env.JOB_DEMO_DELAY_MS ?? 1500),
  // Timeout when checking that a source link responds.
  fetchTimeoutMs: 8000,
} as const;
