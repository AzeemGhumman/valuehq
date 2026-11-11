'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, Home, Loader, LogOut, PanelLeft, Plus, Settings, Sparkles } from 'lucide-react';
import { logout } from '@/server/actions';
import { cn } from '@/lib/utils';

type Item = { id: string; name: string };
type Props = {
  companyName: string;
  userName: string;
  offerings: Item[];
  accounts: (Item & { priority: string })[];
  activeJobs: number;
};

const dot: Record<string, string> = { P1: 'bg-emerald-600', P2: 'bg-primary', P3: 'bg-slate-300' };

function NavLink({ href, active, children, title }: { href: string; active: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'flex h-9 items-center gap-2.5 truncate rounded-md px-3 text-sm text-slate-700 hover:bg-muted hover:text-foreground',
        active && 'bg-accent font-semibold text-accent-foreground hover:bg-accent',
      )}
    >
      {children}
    </Link>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <div className="flex h-8 items-center justify-between pr-1 pl-3">
        <button type="button" onClick={() => setOpen(!open)} className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase" aria-expanded={open}>
          {title}<ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        </button>
        {action}
      </div>
      {open && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

export function Sidebar({ companyName, userName, offerings, accounts, activeJobs }: Props) {
  const path = usePathname();
  const is = (href: string, exact = false) => (exact ? path === href : path === href || path.startsWith(href + '/'));
  const [collapsed, setCollapsed] = useState(false);
  const addBtn = 'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 items-center justify-center rounded-md';

  return (
    <aside className={cn('bg-sidebar flex shrink-0 flex-col border-r px-3 py-4 md:sticky md:top-0 md:h-screen', collapsed ? 'w-[64px]' : 'w-full md:w-[248px]')}>
      <div className="mb-3 flex items-center justify-between pl-2">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className="bg-primary size-6 shrink-0 rounded-md" />
          {!collapsed && 'ValueHQ'}
        </Link>
        <button type="button" onClick={() => setCollapsed(!collapsed)} className={addBtn} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <PanelLeft className="size-4" />
        </button>
      </div>

      <nav className="mb-4 flex flex-col gap-0.5" aria-label="Main">
        <NavLink href="/" active={is('/', true)} title="Home"><Home className="size-4 shrink-0" />{!collapsed && 'Home'}</NavLink>
        <span className="flex h-9 items-center gap-2.5 px-3 text-sm text-slate-400" title="Find accounts: not built yet">
          <Sparkles className="size-4 shrink-0" />{!collapsed && <>Find accounts <span className="ml-auto rounded-full border px-1.5 text-[10px]">soon</span></>}
        </span>
        <NavLink href="/jobs" active={is('/jobs')} title="Background jobs">
          <Loader className="size-4 shrink-0" />
          {!collapsed && 'Background jobs'}
          {!collapsed && activeJobs > 0 && <span className="ml-auto rounded-full bg-amber-600 px-1.5 text-[11px] font-semibold text-white">{activeJobs}</span>}
        </NavLink>
      </nav>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="My company">
            <NavLink href="/company" active={is('/company')}>{companyName || 'Overview'}</NavLink>
            <div className="flex h-8 items-center justify-between pr-1 pl-3 text-sm text-slate-700">
              Offerings
              <Link href="/offerings/new" className={addBtn} aria-label="Add offering" title="Add offering"><Plus className="size-4" /></Link>
            </div>
            <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
              {offerings.length === 0 && <span className="text-muted-foreground px-3 py-1.5 text-xs">No offerings yet</span>}
              {offerings.map((o) => <NavLink key={o.id} href={`/offerings/${o.id}`} active={is(`/offerings/${o.id}`)}>{o.name}</NavLink>)}
            </div>
          </Section>

          <Section title="Accounts" action={<Link href="/accounts/new" className={addBtn} aria-label="Add account" title="Add account"><Plus className="size-4" /></Link>}>
            <NavLink href="/accounts" active={is('/accounts', true)}>All accounts</NavLink>
            {accounts.length === 0 && <span className="text-muted-foreground px-3 py-1.5 text-xs">No accounts yet</span>}
            {accounts.map((a) => (
              <NavLink key={a.id} href={`/accounts/${a.id}`} active={is(`/accounts/${a.id}`)}>
                <span className={cn('size-2 shrink-0 rounded-full', dot[a.priority] ?? dot.P3)} />
                <span className="truncate">{a.name}</span>
              </NavLink>
            ))}
          </Section>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <NavLink href="/settings" active={is('/settings')} title="Settings"><Settings className="size-4 shrink-0" />{!collapsed && 'Settings'}</NavLink>
        <form action={logout} className="flex items-center gap-2.5 pt-1 pl-2">
          <span className="bg-accent text-accent-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{userName.slice(0, 1).toUpperCase()}</span>
          {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</span>}
          <button type="submit" className={addBtn} aria-label="Log out" title="Log out"><LogOut className="size-4" /></button>
        </form>
      </div>
    </aside>
  );
}
