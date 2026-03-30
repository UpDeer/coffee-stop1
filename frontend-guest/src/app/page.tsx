import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Coffee Stop</h1>
          <p className="text-sm text-zinc-600">
            Открой меню точки по адресу <span className="font-mono">/s/&lt;slug&gt;</span>.
          </p>
        </header>

        {process.env.NODE_ENV === "development" ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm text-zinc-600">Пример для dev-сида:</div>
            <Link
              href="/s/demo"
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            >
              Открыть /s/demo
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
