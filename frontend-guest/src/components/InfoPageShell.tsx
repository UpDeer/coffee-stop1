import Link from "next/link";
import type { ReactNode } from "react";

export function InfoPageShell({
  title,
  closeHref = "/",
  children,
}: {
  title: string;
  closeHref?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        <Link
          href={closeHref}
          aria-label="Закрыть"
          title="Закрыть"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm leading-none text-zinc-600 hover:text-zinc-900"
        >
          ✕
        </Link>
      </header>
      {children}
    </main>
  );
}

