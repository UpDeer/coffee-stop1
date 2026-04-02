import Link from "next/link";
import type { ReactNode } from "react";

export function InfoPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        <Link
          href="/"
          aria-label="Закрыть"
          title="Закрыть"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-xl font-semibold text-zinc-700 hover:text-zinc-900"
        >
          ✕
        </Link>
      </header>
      {children}
    </main>
  );
}

