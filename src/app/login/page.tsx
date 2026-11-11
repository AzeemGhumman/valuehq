import { redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { getSession } from '@/server/auth';
import { login } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect('/');
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-wrap">
      <main className="flex flex-[1_1_520px] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2.5 text-xl font-semibold"><span className="bg-primary size-7 rounded-md" />ValueHQ</div>
          <div>
            <h1 className="text-3xl">Sign in</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">Only people invited to your workspace can get in.</p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">That email and password don’t match.</p>}
          <form action={login} className="flex flex-col gap-4">
            <Field label="Work email"><Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" className="h-11" /></Field>
            <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required placeholder="Your password" className="h-11" /></Field>
            <Button type="submit" size="lg" className="h-11">Sign in</Button>
          </form>
          <p className="text-muted-foreground text-xs">No account? Ask your workspace admin to add you.</p>
        </div>
      </main>
      <aside className="flex flex-[1_1_420px] items-center justify-center bg-[#EEF2FB] p-12">
        <div className="max-w-md">
          <p className="mb-5 text-2xl leading-snug font-semibold text-[#14213D]">Walk into every first meeting knowing what your buyer cares about, with the sources to prove it.</p>
          <ul className="flex flex-col gap-2 text-sm text-slate-700">
            {['Account briefs built from filings, calls and news', 'POV decks in your company’s style', 'Every claim linked to its source'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="text-primary size-4" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
