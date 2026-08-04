import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "@/components/SignOutButton";
import { ChevronLeftIcon } from "@/components/Icons";

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
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
