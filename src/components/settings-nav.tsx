'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SettingsNav({ showWorkspace }: { showWorkspace: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: '/settings', label: 'Your profile' },
    { href: '/settings/members', label: 'Members' },
    { href: '/settings/roles', label: 'Roles' },
    ...(showWorkspace ? [{ href: '/settings/workspace', label: 'Workspace' }] : []),
  ];
  return (
    <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Settings sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn('pb-2.5 text-sm whitespace-nowrap text-slate-500 hover:text-foreground', path === t.href && 'border-primary text-foreground border-b-2 font-semibold')}>{t.label}</Link>
      ))}
    </nav>
  );
}
