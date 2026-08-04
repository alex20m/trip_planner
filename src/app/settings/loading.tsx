import Skeleton from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-32" />
      </header>

      <section className="mb-8">
        <Skeleton className="mb-2 h-4 w-16" />
        <Skeleton className="h-10 w-64" />
      </section>

      <section>
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="h-16 w-full" />
      </section>
    </main>
  );
}
