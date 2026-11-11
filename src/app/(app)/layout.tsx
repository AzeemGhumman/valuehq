import { Sidebar } from '@/components/sidebar';
import { requireUser } from '@/server/auth';
import { accounts, company, jobsRepo, offerings } from '@/server/repo';

const order = { P1: 0, P2: 1, P3: 2 } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireUser();
  const [c, offs, accts, jobs] = await Promise.all([
    company.get(workspace.id), offerings.list(workspace.id), accounts.list(workspace.id), jobsRepo.list(workspace.id),
  ]);
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued' || j.status === 'needs-help').length;
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        companyName={c?.name ?? workspace.name}
        userName={user.name}
        offerings={offs.map((o) => ({ id: o.id, name: o.name }))}
        accounts={accts.sort((a, b) => order[a.priority] - order[b.priority] || a.name.localeCompare(b.name)).map((a) => ({ id: a.id, name: a.name, priority: a.priority }))}
        activeJobs={activeJobs}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
