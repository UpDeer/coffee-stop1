"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRublesFromCents } from "@/lib/money";
import { addLine } from "@/lib/cart";
import type { MenuItem, ModifierGroup } from "@/lib/types";

function minRequiredCount(groups: ModifierGroup[]): number {
  return groups.reduce((s, g) => s + Math.max(0, g.min_select ?? 0), 0);
}

const EMPTY_GROUPS: ModifierGroup[] = [];

export function ItemCustomizeModal({
  slug,
  item,
  onClose,
  onPay,
  onAdded,
}: {
  slug: string;
  item: MenuItem;
  onClose: () => void;
  onPay: () => void;
  onAdded?: (label: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const groups = item.modifier_groups ?? EMPTY_GROUPS;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Prevent background scroll while modal is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center"
      onMouseDown={(e) => {
        // close only when clicking the backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-zinc-900">{item.name}</div>
            {item.description ? <div className="mt-1 text-sm text-zinc-600">{item.description}</div> : null}
            <div className="mt-2 text-sm font-medium text-zinc-900">База: {formatRublesFromCents(item.price_cents)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-1 text-sm font-semibold text-zinc-700"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-5">
          {groups.map((g) => {
            const selected = selectedByGroup.get(g.id) ?? new Set<string>();
            const max = g.max_select ?? 0;

            return (
              <div key={g.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{g.name}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {g.options.map((o) => {
                    const checked = selected.has(o.id);
                    const disabled = !checked && max > 0 && selected.size >= max;

                    return (
                      <label
                        key={o.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                          checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
                        } ${
                          disabled
                            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-600"
                            : "cursor-pointer text-zinc-900"
                        }`}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {o.name}
                          {o.price_delta_cents ? (
                            <span className="ml-2 text-xs text-zinc-600">
                              +{formatRublesFromCents(o.price_delta_cents)}
                            </span>
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
              <div className="mt-3 text-xs text-red-700">
                Выберите обязательные опции (минимум {minRequiredCount(groups)}).
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!isValidSelection}
                onClick={() => {
                  addLine(slug, {
                    menu_item_id: item.id,
                    quantity,
                    modifier_option_ids: selectedOptionIds,
                  });
                  onAdded?.(item.name);
                  onClose();
                }}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 disabled:opacity-70 border border-zinc-200"
              >
                Выбрать еще
              </button>

              <button
                type="button"
                disabled={!isValidSelection}
                onClick={() => {
                  addLine(slug, {
                    menu_item_id: item.id,
                    quantity,
                    modifier_option_ids: selectedOptionIds,
                  });
                  onAdded?.(item.name);
                  onPay();
                }}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
              >
                Оплатить {formatRublesFromCents(totalCents)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

