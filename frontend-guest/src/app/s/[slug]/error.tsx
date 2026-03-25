"use client";

export default function StoreMenuError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Не удалось загрузить меню: <span className="font-mono">{error.message}</span>
        </div>
      </main>
    </div>
  );
}

