import { Badge } from '@/components/ui/badge';
import { JOB_STATUS } from '@/lib/labels';
import type { JobStatus, StepStatus } from '@/server/types';

const variant: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  done: 'success', 'needs-help': 'warning', running: 'info', queued: 'secondary', waiting: 'secondary', failed: 'destructive',
};

// `label` replaces the standard wording (customer views use softer wording for problems).
export function JobBadge({ status, label }: { status: JobStatus | StepStatus; label?: string }) {
  const v = label && (status === 'failed' || status === 'needs-help') ? 'warning' : variant[status] ?? 'secondary';
  return <Badge variant={v}>{label ?? JOB_STATUS[status] ?? (status === 'waiting' ? 'Waiting' : status)}</Badge>;
}
