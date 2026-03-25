"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { addLine } from "@/lib/cart";
import { formatRublesFromCents } from "@/lib/money";
import type { MenuItem, ModifierGroup, StoreMenu } from "@/lib/types";

function minRequiredCount(groups: ModifierGroup[]): number {
  return groups.reduce((s, g) => s + Math.max(0, g.min_select ?? 0), 0);
}

const EMPTY_GROUPS: ModifierGroup[] = [];

export function ItemCustomizeClient({
  slug,
  menu,
  item,
}: {
  slug: string;
  menu: StoreMenu;
  item: MenuItem;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

  const groups = item.modifier_groups ?? EMPTY_GROUPS;
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  const selectedByGroup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const g of groups) map.set(g.id, new Set());
    for (const optId of selectedOptionIds) {
      for (const g of groups) {
        if (g.options.some((o) => o.id === optId)) map.get(g.id)?.add(optId);
      }
    }
    return map;
  }, [groups, selectedOptionIds]);

  const totalCents = useMemo(() => {
    const optDelta = groups
      .flatMap((g) => g.options)
      .filter((o) => selectedOptionIds.includes(o.id))
      .reduce((s, o) => s + (o.price_delta_cents ?? 0), 0);
    const unit = item.price_cents + optDelta;
    return unit * quantity;
  }, [groups, item.price_cents, quantity, selectedOptionIds]);

  const isValidSelection = useMemo(() => {
    for (const g of groups) {
      const selectedCount = selectedByGroup.get(g.id)?.size ?? 0;
      const min = g.min_select ?? 0;
      const max = g.max_select ?? 0;
      if (selectedCount < min) return false;
      if (max > 0 && selectedCount > max) return false;
    }
    return true;
  }, [groups, selectedByGroup]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title={menu.store.name} />

      <main className="mx-auto max-w-xl px-4 py-6">
        <Link
          href={withQr(`/s/${encodeURIComponent(slug)}`)}
          className="text-sm font-medium text-zinc-700"
        >
          ← Назад в меню
        </Link>

        <div className="mt-4 flex flex-col gap-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-lg font-semibold text-zinc-900">{item.name}</div>
            {item.description ? <div className="mt-1 text-sm text-zinc-600">{item.description}</div> : null}
            <div className="mt-2 text-sm font-medium text-zinc-900">База: {formatRublesFromCents(item.price_cents)}</div>
          </div>

          {groups.map((g) => {
            const selected = selectedByGroup.get(g.id) ?? new Set<string>();
            const max = g.max_select ?? 0;
            return (
              <div key={g.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{g.name}</div>
                  <div className="text-xs text-zinc-500">
                    {g.min_select ?? 0}–{g.max_select ?? 0}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {g.options.map((o) => {
                    const checked = selected.has(o.id);
                    const disabled = !checked && max > 0 && selected.size >= max;
                    return (
                      <label
                        key={o.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                          checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
                        } ${disabled ? "opacity-50" : ""}`}
                      >
                        <span className="min-w-0 truncate">
                          {o.name}
                          {o.price_delta_cents ? (
                            <span className="ml-2 text-xs text-zinc-500">+{formatRublesFromCents(o.price_delta_cents)}</span>
                          ) : null}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = new Set(selectedOptionIds);
                            if (e.target.checked) next.add(o.id);
                            else next.delete(o.id);
                            setSelectedOptionIds(Array.from(next));
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-900">Количество</div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                >
                  −
                </button>
                <div className="w-10 text-center text-sm font-semibold">{quantity}</div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-lg"
                >
                  +
                </button>
              </div>
            </div>

            {!isValidSelection ? (
              <div className="mt-3 text-xs text-red-700">Выберите обязательные опции (минимум {minRequiredCount(groups)}).</div>
            ) : null}

            <button
              type="button"
              disabled={!isValidSelection}
              onClick={() => {
                addLine(slug, {
                  menu_item_id: item.id,
                  quantity,
                  modifier_option_ids: selectedOptionIds,
                });
                window.location.href = withQr(`/s/${encodeURIComponent(slug)}/cart`);
              }}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Добавить в корзину — {formatRublesFromCents(totalCents)}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

