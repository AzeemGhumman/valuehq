// Starting background jobs. In AWS this starts a Step Functions execution; locally it runs the same steps in-process.
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { aws } from '@config/aws';
import { jobs as jobsConfig } from '@config/jobs';
import { checkSource, fail, finish, start, type SourceTask } from '@/jobs/steps';
import { jobsRepo, sources, timeId } from './repo';
import type { Account, Job } from './types';

const sfn = new SFNClient({ region: aws.region });

// Returns false when the account has no sources with a link to check.
export async function startCheckSources(workspaceId: string, createdBy: string, account: Account): Promise<boolean> {
  const list = (await sources.list(workspaceId, 'account', account.id)).filter((s) => s.url);
  if (list.length === 0) return false;

  const now = new Date().toISOString();
  const tasks: SourceTask[] = list.map((s, index) => ({ index, id: s.id, ownerType: s.ownerType, ownerId: s.ownerId, label: s.label, url: s.url! }));
  const job: Job = {
    id: timeId(), workspaceId, type: 'check-sources', title: `Check sources for ${account.name}`, status: 'queued', accountId: account.id,
    steps: [...tasks.map((t) => ({ name: `Check ${t.label}`, status: 'waiting' as const })), { name: 'Summarize', status: 'waiting' as const }],
    doneCount: 0, totalCount: tasks.length, createdBy, createdAt: now, updatedAt: now,
  };
  await jobsRepo.put(job);

  const input = { workspaceId, jobId: job.id, sources: tasks };
  if (jobsConfig.runner === 'stepfunctions') {
    const res = await sfn.send(new StartExecutionCommand({ stateMachineArn: aws.stateMachineArn, name: job.id, input: JSON.stringify(input) }));
    await jobsRepo.patch(workspaceId, job.id, { executionArn: res.executionArn });
  } else {
    // Local development: same steps, run in the background of the dev server.
    void (async () => {
      const ref = { workspaceId, jobId: job.id };
      try {
        await start(ref);
        const results = await Promise.all(tasks.map((t) => checkSource(ref, t)));
        await finish(ref, results);
      } catch (e) {
        await fail(ref, e instanceof Error ? e.message : e);
      }
    })();
  }
  return true;
}
