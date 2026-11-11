import { CheckCircle2, AlertCircle } from 'lucide-react';

// Short confirmation or error after a form submits (from ?saved= / ?error= in the URL).
const SAVED: Record<string, string> = {
  '1': 'Saved', created: 'Created', duplicated: 'Duplicated. Rename it below.', deleted: 'Deleted', removed: 'Removed',
  source: 'Source added', row: 'Value map updated', password: 'Password changed', job: 'Job started. Follow it in Background jobs.',
};
const ERRORS: Record<string, string> = {
  'wrong-password': 'Your current password is wrong.',
  'short-password': 'Passwords need at least 10 characters.',
  'no-sources': 'Add a source with a link first.',
};

export function Flash({ saved, error }: { saved?: string; error?: string }) {
  if (error) {
    return <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700"><AlertCircle className="size-4" />{ERRORS[error] ?? 'Something went wrong.'}</p>;
  }
  if (saved) {
    return <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" />{SAVED[saved] ?? 'Saved'}</p>;
  }
  return null;
}
