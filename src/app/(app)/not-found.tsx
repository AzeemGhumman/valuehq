import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1>Not found</h1>
      <p className="text-muted-foreground text-sm">This item doesn’t exist or was deleted.</p>
      <Button asChild variant="outline"><Link href="/">Back to Home</Link></Button>
    </div>
  );
}
