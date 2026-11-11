import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Label + control pair used in every form.
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <Label className={cn('text-foreground', className)}><span>{label}</span>{children}</Label>;
}
