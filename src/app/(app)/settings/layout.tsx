import { ROLES } from '@config/roles';
import { app } from '@config/app';
import { pageContext } from '@/server/context';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { SettingsNav } from '@/components/settings-nav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, caps } = await pageContext();
  return (
    <>
      <PageHeader
        title="Settings"
        description={<span className="flex flex-wrap items-center gap-2">{workspace.name} workspace · your role: {ROLES[user.role]?.label ?? user.role} <Badge variant="secondary">{app.env}</Badge></span>}
      />
      <SettingsNav showWorkspace={caps['workspace.settings']} />
      {children}
    </>
  );
}
