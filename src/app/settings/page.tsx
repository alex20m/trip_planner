import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { ChevronLeftIcon, LogOutIcon } from "@/components/Icons";

export default async function Settings() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 flex items-center gap-3">
        <Link href="/" className="btn-ghost btn-icon" aria-label="Back">
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <section className="mb-8">
        <h2 className="label mb-2">Theme</h2>
        <ThemeToggle />
      </section>

      <section>
        <h2 className="label mb-2">Account</h2>
        <div className="card flex items-center justify-between gap-3 p-4">
          <span className="text-sm">{user.email}</span>
          <form action="/auth/callback?signout=1" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm text-ink/55 transition-colors hover:text-ink"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
