"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ItemCustomizeModal } from "@/components/ItemCustomizeModal";
import { useCart } from "@/lib/useCart";
import { isValidEmail } from "@/lib/validation";
import { addLine } from "@/lib/cart";
import { formatRublesFromCents } from "@/lib/money";
import type { MenuItem, StoreMenu } from "@/lib/types";

function hasModifiers(item: MenuItem): boolean {
  return (item.modifier_groups?.length ?? 0) > 0;
}

export function StoreMenuClient({ slug, menu }: { slug: string; menu: StoreMenu }) {
  const title = menu.store.name;
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const router = useRouter();
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const cart = useCart(slug);
  const emailOk = useMemo(() => isValidEmail(cart.guestEmail), [cart.guestEmail]);
  const [toast, setToast] = useState<string | null>(null);

  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  const availableCategories = useMemo(() => {
    return menu.categories.map((c) => ({
      ...c,
      items: c.items.filter((it) => it.is_available),
    }));
  }, [menu.categories]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title={title} />

      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="flex flex-col gap-7">
          {availableCategories.map((cat) => (
            <section key={cat.id} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{cat.name}</h2>
              <div className="flex flex-col gap-2">
                {cat.items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        {it.image_url ? (
                          <img
                            src={it.image_url}
                            alt={it.name}
                            loading="lazy"
                            className="mb-3 h-20 w-full rounded-xl object-cover"
                          />
                        ) : null}
                        <div className="truncate text-base font-semibold text-zinc-900">{it.name}</div>
                        {it.description ? (
                          <div className="mt-1 line-clamp-2 text-sm text-zinc-600">{it.description}</div>
                        ) : null}
                        <div className="mt-2 text-sm font-medium text-zinc-900">
                          {formatRublesFromCents(it.price_cents)}
                        </div>
                      </div>

                      {hasModifiers(it) ? (
                        <button
                          type="button"
                          onClick={() => setActiveItem(it)}
                          className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                        >
                          Выбрать
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            (() => {
                              addLine(slug, {
                                menu_item_id: it.id,
                                quantity: 1,
                                modifier_option_ids: [],
                              });
                              setToast(`Добавлено: ${it.name}`);
                            })()
                          }
                          className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                        >
                          В корзину
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {activeItem ? (
        <ItemCustomizeModal
          slug={slug}
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onAdded={(label) => setToast(`Добавлено: ${label}`)}
          onPay={() => {
            // В модалке товар уже добавлен в корзину.
            // Если email не задан — отправляем на экран корзины, там есть поле email.
            if (!emailOk) {
              router.replace(withQr(`/s/${encodeURIComponent(slug)}/cart`));
              return;
            }
            router.replace(withQr(`/s/${encodeURIComponent(slug)}/pay`));
            setActiveItem(null);
          }}
        />
      ) : null}

      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all duration-200 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        {toast ?? ""}
      </div>
    </div>
  );
}

