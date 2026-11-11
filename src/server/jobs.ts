// Starting background jobs. In AWS this starts a Step Functions execution; locally it runs the same steps in-process.
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { aws } from '@config/aws';
import { jobs as jobsConfig } from '@config/jobs';
import { checkSource, fail, finish, start, type SourceTask } from '@/jobs/steps';
import { jobsRepo, sources, timeId } from './repo';
import type { Account, Job, JobType, Source } from './types';

const sfn = new SFNClient({ region: aws.region });

// Creates the job record and runs it: one step per source, then a summary step.
async function runSourceJob(workspaceId: string, createdBy: string, jobType: JobType, title: string, list: Source[], extra: Partial<Job> = {}) {
  const now = new Date().toISOString();
  const extract = jobType === 'build-profile';
  const tasks: SourceTask[] = list.map((s, index) => ({ index, id: s.id, ownerType: s.ownerType, ownerId: s.ownerId, label: s.label, url: s.url!, extract }));
  const job: Job = {
    id: timeId(), workspaceId, jobType, title, status: 'queued', ...extra,
    steps: [...tasks.map((t) => ({ name: `${extract ? 'Read' : 'Check'} ${t.label}`, status: 'waiting' as const })), { name: extract ? 'Draft the company profile' : 'Summarize', status: 'waiting' as const }],
    doneCount: 0, totalCount: tasks.length, createdBy, createdAt: now, updatedAt: now,
  };
  await jobsRepo.put(job);

  const input = { workspaceId, jobId: job.id, jobType, sources: tasks };
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
  return job;
}

// Returns false when the account has no sources with a link to check.
export async function startCheckSources(workspaceId: string, createdBy: string, account: Account): Promise<boolean> {
  const list = (await sources.list(workspaceId, 'account', account.id)).filter((s) => s.url);
  if (list.length === 0) return false;
  await runSourceJob(workspaceId, createdBy, 'check-sources', `Check sources for ${account.name}`, list, { accountId: account.id });
  return true;
}

// Reads the company's website and other linked company sources and drafts the empty profile fields.
// Returns null when there's nothing with a link to read.
export async function startBuildProfile(workspaceId: string, createdBy: string, companyName: string): Promise<Job | null> {
  const list = (await sources.list(workspaceId, 'company', workspaceId)).filter((s) => s.url);
  if (list.length === 0) return null;
  return runSourceJob(workspaceId, createdBy, 'build-profile', `Build the ${companyName} profile`, list);
}
