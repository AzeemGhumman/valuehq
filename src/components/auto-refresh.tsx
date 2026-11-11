'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-renders the page from the server every `ms` while `active` is true (used while jobs run).
export function AutoRefresh({ active, ms }: { active: boolean; ms: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
