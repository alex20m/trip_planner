import Skeleton from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </header>

      <Skeleton className="h-12 w-full" />

      <ul className="mt-6 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-16 w-full" />
          </li>
        ))}
      </ul>
    </main>
  );
}
