import { AlertCircle, CheckCircle2 } from 'lucide-react';

// Short confirmation or error after a form submits (from ?saved= / ?error= in the URL).
const SAVED: Record<string, string> = {
  '1': 'Saved', created: 'Created', duplicated: 'Duplicated. Rename it below.', deleted: 'Deleted', removed: 'Removed',
  source: 'Source added', row: 'Value map updated', password: 'Password changed', job: 'Job started. Follow it in Background jobs.',
  team: 'Owner and team updated', member: 'Member added', role: 'Role changed', 'password-reset': 'Password reset. Share it with them privately.',
  rules: 'Rules saved for this workspace', reset: 'Rules reset to the defaults',
  provisioned: 'Org created. Share the sign-in details with their admin.',
  'provisioned-job': 'Org created. Their profile is being built in the background; it shows on their Home page.',
  'org-disabled': 'Org disabled. Its people are signed out and can’t sign in.', 'org-enabled': 'Org enabled',
  seeded: 'Sample data loaded', 'member-updated': 'Saved', 'user-disabled': 'Disabled. They’re signed out.', 'user-enabled': 'Enabled',
};
const ERRORS: Record<string, string> = {
  'wrong-password': 'Your current password is wrong.',
  'short-password': 'That password is too short.',
  'no-sources': 'Add a source with a link first.',
  'member-exists': 'That person is already in this workspace.',
  'email-taken': 'That email belongs to someone in another workspace.',
  'last-admin': 'A workspace needs at least one admin. Make someone else an admin first.',
  'self-role': 'You can’t change your own role. Ask another admin.',
  'self-remove': 'You can’t remove yourself. Ask another admin.',
  'self-disable': 'You can’t disable yourself.',
  'self-email': 'Change your own email from the command line (npm run users).',
  'bad-email': 'That email doesn’t look right.',
  'org-exists': 'An org with that name already exists.',
  'confirm-name': 'Type the org’s name exactly to delete it.',
  internal: 'The platform team’s own workspace can’t be disabled or deleted.',
};

export function Flash({ saved, error, need }: { saved?: string; error?: string; need?: string }) {
  if (error) {
    const msg = error === 'forbidden'
      ? `Your role doesn’t allow this${need ? `: ${need.charAt(0).toLowerCase()}${need.slice(1)}` : ''}. Ask an admin, or see Settings › Roles.`
      : ERRORS[error] ?? 'Something went wrong.';
    return <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700"><AlertCircle className="size-4 shrink-0" />{msg}</p>;
  }
  if (saved) {
    return <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />{SAVED[saved] ?? 'Saved'}</p>;
  }
  return null;
}
