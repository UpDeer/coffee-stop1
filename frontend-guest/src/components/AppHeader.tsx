"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { useCart } from "@/lib/useCart";

export function AppHeader({
  slug,
  title,
  subtitle,
  children,
}: {
  slug: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const cart = useCart(slug);
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };
  const count = useMemo(() => cart.lines.reduce((s, l) => s + (l.quantity ?? 0), 0), [cart.lines]);

  const countLabel = useMemo(() => (count > 0 ? String(count) : ""), [count]);

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <Link
            href={withQr(`/s/${encodeURIComponent(slug)}`)}
            className="block truncate text-sm font-semibold text-zinc-900 hover:underline"
            title="Вернуться в меню"
          >
            {title}
          </Link>
          {subtitle ? <div className="mt-0.5 text-xs text-zinc-600">{subtitle}</div> : null}
        </div>
        <Link
          href={withQr(`/s/${encodeURIComponent(slug)}/cart`)}
          className="relative inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900"
        >
          Корзина
          {countLabel ? (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-semibold text-white">
              {countLabel}
            </span>
          ) : null}
        </Link>
      </div>
      {children ? <div className="mx-auto max-w-xl px-4 pb-3">{children}</div> : null}
    </header>
  );
}

