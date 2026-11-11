import Link from 'next/link';
import { Lock } from 'lucide-react';

// Shown where a form is read-only for the current role.
export function ViewOnly({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Lock className="size-3.5" />View only. Your role can’t {what}. <Link href="/settings/roles" className="underline">See roles</Link>
    </p>
  );
}
