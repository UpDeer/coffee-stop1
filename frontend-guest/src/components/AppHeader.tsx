"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { useCart } from "@/lib/useCart";

export function AppHeader({ slug, title }: { slug: string; title: string }) {
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
          <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">/{slug}</div>
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
    </header>
  );
}

