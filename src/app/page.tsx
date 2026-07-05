import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewTripForm from "@/components/NewTripForm";
import TripList from "@/components/TripList";
import InstallButton from "@/components/InstallButton";

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
      <header className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My trips</h1>
        <div className="flex items-center gap-3">
          <InstallButton />
          <form action="/auth/callback?signout=1" method="post">
            <Link href="/login" className="text-sm text-ink/60 hover:text-ink">
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
