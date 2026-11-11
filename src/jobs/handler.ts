// Lambda used by every Task state in the Step Functions state machine (template.yaml).
// The state machine passes `action` to choose the step.
import { checkSource, fail, finish, start, type CheckResult, type JobRef, type SourceTask } from './steps';

type Event =
  | (JobRef & { action: 'start' })
  | (JobRef & { action: 'check'; source: SourceTask })
  | (JobRef & { action: 'finish'; results: CheckResult[] })
  | (JobRef & { action: 'fail'; error: unknown });

export async function handler(event: Event) {
  console.log(JSON.stringify({ msg: 'job step', action: event.action, jobId: event.jobId, workspaceId: event.workspaceId }));
  switch (event.action) {
    case 'start': return start(event);
    case 'check': return checkSource(event, event.source);
    case 'finish': return finish(event, event.results);
    case 'fail': return fail(event, event.error);
  }
}
