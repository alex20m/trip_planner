import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewTripForm from "@/components/NewTripForm";
import TripList from "@/components/TripList";
import InstallButton from "@/components/InstallButton";
import { LogoMark } from "@/components/Logo";

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 whitespace-nowrap text-2xl font-bold tracking-tight">
          <LogoMark className="h-8 w-8 shrink-0" />
          My trips
        </h1>
        <div className="flex items-center gap-3">
          <InstallButton />
          <form action="/auth/callback?signout=1" method="post">
            <Link href="/login" className="truncate text-sm text-ink/60 hover:text-ink">
              {user.email}
            </Link>
          </form>
        </div>
      </header>

      <NewTripForm />

      <TripList initialTrips={trips ?? []} />
    </main>
  );
}
