import { ShieldCheck } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { exitOrg } from '@/server/admin-actions';
import { ROLES } from '@config/roles';
import { pageContext } from '@/server/context';
import { accounts, company, jobsRepo, offerings } from '@/server/repo';

const order = { P1: 0, P2: 1, P3: 2 } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, caps, operator } = await pageContext();
  const [c, offs, accts, jobs] = await Promise.all([
    company.get(workspace.id), offerings.list(workspace.id), accounts.list(workspace.id), jobsRepo.list(workspace.id),
  ]);
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued' || j.status === 'needs-help').length;
  return (
    <>
    {operator && (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#14213D] px-4 py-2 text-sm text-white">
        <ShieldCheck className="size-4" />
        <span>Operator view of <strong>{workspace.name}</strong>. You act as an admin; changes are recorded under {operator.email}.</span>
        <form action={exitOrg}><button type="submit" className="underline underline-offset-2 hover:text-white/80">Back to platform admin</button></form>
      </div>
    )}
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        companyName={c?.name ?? workspace.name}
        userName={user.name}
        offerings={offs.map((o) => ({ id: o.id, name: o.name }))}
        accounts={accts.sort((a, b) => order[a.priority] - order[b.priority] || a.name.localeCompare(b.name)).map((a) => ({ id: a.id, name: a.name, priority: a.priority }))}
        activeJobs={activeJobs}
        roleLabel={operator ? 'Operator (as admin)' : user.isOperator ? 'Platform operator' : ROLES[user.role]?.label ?? user.role}
        canAddOffering={caps['offerings.manage']}
        canAddAccount={caps['accounts.create']}
        isOperator={!!(operator ?? user).isOperator}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
      </main>
    </div>
    </>
  );
}
