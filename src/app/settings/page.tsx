import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default async function Settings() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center gap-3">
        <Link href="/" className="text-ink/50 hover:text-ink" aria-label="Back">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-ink/60">Theme</h2>
        <ThemeToggle />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink/60">Account</h2>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/20 bg-surface p-3">
          <span className="text-sm">{user.email}</span>
          <form action="/auth/callback?signout=1" method="post">
            <button type="submit" className="text-sm text-ink/60 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
