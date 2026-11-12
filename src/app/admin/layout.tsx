import Link from 'next/link';
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { requireOperator } from '@/server/auth';
import { exitOrg } from '@/server/admin-actions';
import { logout } from '@/server/actions';
import { Button } from '@/components/ui/button';

export const metadata = { title: { template: '%s · Platform admin', default: 'Platform admin' } };

// The ValueHQ team's console. Only platform operators get here (requireOperator).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me, operator, workspace } = await requireOperator();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-[#14213D] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/admin" className="flex items-center gap-2.5 font-semibold"><ShieldCheck className="size-5" />ValueHQ · Platform admin</Link>
          <nav className="flex items-center gap-4 text-sm text-white/80">
            <Link href="/admin" className="hover:text-white">Orgs</Link>
            <Link href="/admin/orgs/new" className="hover:text-white">New org</Link>
            <Link href="/admin/crawls" className="hover:text-white">Crawls</Link>
            <Link href="/admin/costs" className="hover:text-white">Costs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {operator && (
              <>
                <Link href="/" className="flex items-center gap-1 text-white/80 hover:text-white"><ArrowLeft className="size-4" />Back to {workspace.name}</Link>
                <form action={exitOrg}><Button type="submit" size="sm" variant="outline" className="h-8 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">Leave org</Button></form>
              </>
            )}
            <span className="text-white/70">{me.email}</span>
            <form action={logout}><button type="submit" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/10" aria-label="Log out" title="Log out"><LogOut className="size-4" /></button></form>
          </div>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
