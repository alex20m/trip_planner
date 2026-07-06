import Skeleton from "@/components/Skeleton";

export default function TripLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-7 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      </header>

      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-7" />
      </div>

      <Skeleton className="h-96 w-full" />

      <section className="mt-8">
        <Skeleton className="mb-3 h-6 w-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </section>
    </main>
  );
}
