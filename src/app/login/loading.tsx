import Spinner from "@/components/Spinner";

export default function LoginLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-6">
      <Spinner className="h-6 w-6 text-ink/40" />
    </main>
  );
}
