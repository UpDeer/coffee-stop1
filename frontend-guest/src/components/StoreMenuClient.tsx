"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ItemCustomizeModal } from "@/components/ItemCustomizeModal";
import { useCart } from "@/lib/useCart";
import { isValidEmail } from "@/lib/validation";
import Link from "next/link";

import { addLine, removeLine, updateLine } from "@/lib/cart";
import { getStoreMenuLive } from "@/lib/api";
import { normalizeExternalImageUrl } from "@/lib/imageUrl";
import { formatRublesFromCents } from "@/lib/money";
import type { MenuItem, StoreMenu } from "@/lib/types";

function hasModifiers(item: MenuItem): boolean {
  return (item.modifier_groups?.length ?? 0) > 0;
}

export function StoreMenuClient({ slug, menu }: { slug: string; menu: StoreMenu }) {
  const [menuState, setMenuState] = useState<StoreMenu>(menu);
  const title = menuState.store.name;
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const router = useRouter();
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const cart = useCart(slug);
  const emailOk = useMemo(() => isValidEmail(cart.guestEmail), [cart.guestEmail]);
  const cartCount = useMemo(() => cart.lines.reduce((s, l) => s + (l.quantity ?? 0), 0), [cart.lines]);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  useEffect(() => {
    setMenuState(menu);
  }, [menu]);

  const availableCategories = useMemo(() => {
    return menuState.categories.map((c) => ({
      ...c,
      items: c.items.filter((it) => it.is_available),
    }));
  }, [menuState.categories]);

  /** Categories that have at least one available item (controls filter chips + list). */
  const categoriesForFilter = useMemo(
    () => availableCategories.filter((c) => c.items.length > 0),
    [availableCategories]
  );

  /**
   * `null` — фильтр не применён, показываются все категории.
   * Иначе — только категории из множества (несколько можно).
   */
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<Set<string> | null>(null);

  useEffect(() => {
    const valid = new Set(categoriesForFilter.map((c) => c.id));
    setActiveCategoryFilter((prev) => {
      if (prev === null) return null;
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === 0) return null;
      // Выбраны все категории по отдельности → как режим «Все».
      if (valid.size > 0 && next.size === valid.size && [...valid].every((id) => next.has(id))) {
        return null;
      }
      return next;
    });
  }, [categoriesForFilter]);

  const filterActive = activeCategoryFilter !== null;

  const visibleCategories = useMemo(() => {
    if (activeCategoryFilter === null) return categoriesForFilter;
    return categoriesForFilter.filter((c) => activeCategoryFilter.has(c.id));
  }, [categoriesForFilter, activeCategoryFilter]);

  const toggleCategoryFilter = (categoryId: string) => {
    setActiveCategoryFilter((prev) => {
      const full = new Set(categoriesForFilter.map((c) => c.id));
      const isFullSelection = (s: Set<string>) =>
        full.size > 0 && s.size === full.size && [...full].every((id) => s.has(id));

      if (prev === null) {
        const next = new Set([categoryId]);
        return isFullSelection(next) ? null : next;
      }
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
        return next.size === 0 ? null : next;
      }
      next.add(categoryId);
      return isFullSelection(next) ? null : next;
    });
  };

  const clearCategoryFilter = () => setActiveCategoryFilter(null);

  useEffect(() => {
    let cancelled = false;
    let lastRefreshAt = 0;

    const refreshMenu = async () => {
      if (refreshing) return;
      const now = Date.now();
      if (now - lastRefreshAt < 1500) return; // avoid burst
      lastRefreshAt = now;
      setRefreshing(true);
      try {
        const next = await getStoreMenuLive(slug, qrToken);
        if (cancelled) return;
        setMenuState(next);
      } catch (e: unknown) {
        if (cancelled) return;
        setToast(e instanceof Error ? `Не удалось обновить меню: ${e.message}` : "Не удалось обновить меню.");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    const onFocus = () => void refreshMenu();
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshMenu();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [qrToken, slug, refreshing]);

  /** Периодическое обновление меню — новые категории/позиции от баристы без смены вкладки. */
  useEffect(() => {
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const next = await getStoreMenuLive(slug, qrToken);
        if (!cancelled) setMenuState(next);
      } catch {
        /* тихо: сеть может моргнуть */
      }
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slug, qrToken]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader
        slug={slug}
        title={title}
        subtitle="Меню быстрого заказа кофе с самовывозом"
      >
        {categoriesForFilter.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearCategoryFilter}
              aria-pressed={!filterActive}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
                !filterActive
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              Все
            </button>
            {categoriesForFilter.map((cat) => {
              const selected = filterActive && activeCategoryFilter?.has(cat.id);
              const neutral = !filterActive;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={Boolean(selected)}
                  onClick={() => toggleCategoryFilter(cat.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
                    neutral
                      ? "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                      : selected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </AppHeader>

      <main className={`mx-auto max-w-xl px-4 py-6 ${cartCount > 0 ? "pb-24" : ""}`}>
        <div className="flex flex-col gap-7">
          {visibleCategories.length === 0 && categoriesForFilter.length > 0 && filterActive ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              По выбранному фильтру сейчас нет категорий. Нажмите «Все» или выберите другие категории.
            </div>
          ) : null}
          {visibleCategories.map((cat) => (
            <section key={cat.id} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{cat.name}</h2>
              <div className="flex flex-col gap-2">
                {cat.items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        {it.image_url ? (
                          <img
                            src={normalizeExternalImageUrl(it.image_url) ?? it.image_url}
                            alt={it.name}
                            loading="lazy"
                            className="mb-3 h-20 w-full rounded-xl object-cover"
                          />
                        ) : null}
                        <div className="truncate text-base font-semibold text-zinc-900">{it.name}</div>
                        {(() => {
                          const schema = (cat.item_params_schema ?? []).filter((f) => f.key && f.label);
                          if (!schema.length) return null;
                          const params = it.item_params ?? {};
                          const parts = schema
                            .map((f) => {
                              const v = (params as Record<string, unknown>)[f.key];
                              if (v == null || String(v).trim() === "") return null;
                              const unit = f.unit ? ` ${f.unit}` : "";
                              return `${f.label}: ${String(v)}${unit}`;
                            })
                            .filter(Boolean) as string[];
                          if (!parts.length) return null;
                          return <div className="mt-1 text-xs text-zinc-600">{parts.join(" · ")}</div>;
                        })()}
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
                        (() => {
                          const matching = cart.lines.filter(
                            (l) => l.menu_item_id === it.id && (l.modifier_option_ids?.length ?? 0) === 0
                          );
                          const totalQty = matching.reduce((s, l) => s + (l.quantity ?? 0), 0);
                          const primary = matching[0] ?? null;

                          if (!primary || totalQty <= 0) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  addLine(slug, {
                                    menu_item_id: it.id,
                                    quantity: 1,
                                    modifier_option_ids: [],
                                  });
                                  setToast(`Добавлено: ${it.name}`);
                                }}
                                className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                              >
                                В корзину
                              </button>
                            );
                          }

                          const normalize = () => {
                            // If duplicates exist (multiple lines for the same simple item),
                            // collapse them into the first line to make +/- stable.
                            if (matching.length <= 1) return;
                            const nextQty = totalQty;
                            updateLine(slug, primary.id, { quantity: Math.max(1, nextQty) });
                            for (const extra of matching.slice(1)) removeLine(slug, extra.id);
                          };

                          const dec = () => {
                            normalize();
                            if (totalQty <= 1) {
                              removeLine(slug, primary.id);
                            } else {
                              updateLine(slug, primary.id, { quantity: Math.max(1, totalQty - 1) });
                            }
                          };

                          const inc = () => {
                            normalize();
                            updateLine(slug, primary.id, { quantity: Math.max(1, totalQty + 1) });
                          };

                          return (
                            <div className="shrink-0 flex flex-col items-end gap-2">
                              <Link
                                href={withQr(`/s/${encodeURIComponent(slug)}/cart`)}
                                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                              >
                                Перейти в корзину
                              </Link>
                              <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-1">
                                <button
                                  type="button"
                                  onClick={dec}
                                  className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                                  aria-label="Уменьшить количество"
                                >
                                  −
                                </button>
                                <div className="w-8 text-center text-sm font-semibold text-zinc-900">{totalQty}</div>
                                <button
                                  type="button"
                                  onClick={inc}
                                  className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                                  aria-label="Увеличить количество"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="text-sm font-medium text-zinc-900">
              В корзине: <span className="tabular-nums font-semibold">{cartCount}</span>
            </div>
            <Link
              href={withQr(`/s/${encodeURIComponent(slug)}/cart`)}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold ${
                emailOk ? "bg-zinc-900 text-white" : "bg-zinc-900 text-white"
              }`}
            >
              Перейти в корзину
            </Link>
          </div>
        </div>
      ) : null}

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

