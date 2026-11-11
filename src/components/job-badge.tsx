import { Badge } from '@/components/ui/badge';
import { JOB_STATUS } from '@/lib/labels';
import type { JobStatus, StepStatus } from '@/server/types';

const variant: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  done: 'success', 'needs-help': 'warning', running: 'info', queued: 'secondary', waiting: 'secondary', failed: 'destructive',
};

export function JobBadge({ status }: { status: JobStatus | StepStatus }) {
  return <Badge variant={variant[status] ?? 'secondary'}>{JOB_STATUS[status] ?? (status === 'waiting' ? 'Waiting' : status)}</Badge>;
}
