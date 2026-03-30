"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { buildCartView, clearCart, removeLine, setGuestEmail, updateLine } from "@/lib/cart";
import { formatRublesFromCents } from "@/lib/money";
import { useCart } from "@/lib/useCart";
import { isValidEmail } from "@/lib/validation";
import type { StoreMenu } from "@/lib/types";

export function CartClient({ slug, menu }: { slug: string; menu: StoreMenu }) {
  // useSyncExternalStore + getServerSnapshot (в useCart) даёт пустую корзину на SSR/гидратации,
  // затем актуальное состояние из localStorage — без рассинхрона HTML.
  const cart = useCart(slug);
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  const title = menu.store.name;

  const view = useMemo(() => buildCartView(menu, cart), [cart, menu]);
  const emailOk = useMemo(() => isValidEmail(cart.guestEmail), [cart.guestEmail]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title={title} />

      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link
            href={withQr(`/s/${encodeURIComponent(slug)}`)}
            className="text-sm font-medium text-zinc-700"
          >
            ← В меню
          </Link>
          <button
            type="button"
            onClick={() => {
              clearCart(slug);
            }}
            className="text-sm font-medium text-zinc-700"
          >
            Очистить
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {view.lines.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Корзина пустая.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {view.lines.map((l) => (
                <div key={l.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{l.item?.name ?? "Позиция"}</div>
                      {l.options.length ? (
                        <div className="mt-1 text-xs text-zinc-600">{l.options.map((o) => o.name).join(", ")}</div>
                      ) : null}
                      <div className="mt-2 text-sm font-semibold text-zinc-900">{formatRublesFromCents(l.lineTotalCents)}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        removeLine(slug, l.id);
                      }}
                      className="shrink-0 text-sm font-medium text-zinc-600"
                    >
                      Удалить
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">Количество</div>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateLine(slug, l.id, { quantity: Math.max(1, l.quantity - 1) });
                        }}
                        className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                      >
                        −
                      </button>
                      <div className="w-10 text-center text-sm font-semibold">{l.quantity}</div>
                      <button
                        type="button"
                        onClick={() => {
                          updateLine(slug, l.id, { quantity: l.quantity + 1 });
                        }}
                        className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Email для чека и статуса заказа</div>
            <input
              value={cart.guestEmail}
              onChange={(e) => {
                setGuestEmail(slug, e.target.value);
              }}
              placeholder="name@example.com"
              inputMode="email"
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            {!emailOk ? <div className="mt-2 text-xs text-red-700">Введите корректный email.</div> : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm text-zinc-600">Итого</div>
              <div className="text-base font-semibold text-zinc-900">{formatRublesFromCents(view.totalCents)}</div>
            </div>
            <Link
              aria-disabled={!emailOk || view.lines.length === 0}
              href={emailOk && view.lines.length > 0 ? withQr(`/s/${encodeURIComponent(slug)}/pay`) : "#"}
              className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${
                emailOk && view.lines.length > 0 ? "bg-zinc-900 text-white" : "cursor-not-allowed bg-zinc-200 text-zinc-500"
              }`}
            >
              Оплатить
            </Link>
            <div className="mt-2 text-xs text-zinc-500">
              Оплата откроется на стороне банка. Редирект назад не подтверждает оплату — статус обновится после подтверждения.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

