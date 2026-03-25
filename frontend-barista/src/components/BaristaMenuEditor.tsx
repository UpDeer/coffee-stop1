"use client";

import { useCallback, useEffect, useState } from "react";

import { getMenuEditor, putMenuEditor } from "@/lib/api";
import type {
  MenuEditorCategory,
  MenuEditorItem,
  MenuEditorModifierGroup,
  MenuEditorModifierOption,
} from "@/lib/menuTypes";

function newId(): string {
  return crypto.randomUUID();
}

function emptyOption(): MenuEditorModifierOption {
  return { id: newId(), name: "Вариант", price_delta_cents: 0, sort_order: 0 };
}

function emptyGroup(): MenuEditorModifierGroup {
  return {
    id: newId(),
    name: "Группа",
    min_select: 0,
    max_select: 1,
    sort_order: 0,
    options: [emptyOption()],
  };
}

function emptyItem(): MenuEditorItem {
  return {
    id: newId(),
    name: "Новая позиция",
    description: null,
    image_url: null,
    price_cents: 0,
    is_available: true,
    sort_order: 0,
    stock_qty: null,
    modifier_groups: [],
  };
}

function emptyCategory(): MenuEditorCategory {
  return { id: newId(), name: "Новая категория", sort_order: 0, items: [] };
}

function rublesFromCents(cents: number): string {
  return String(Math.round(cents / 100));
}

function centsFromRublesInput(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function BaristaMenuEditor({ storeId }: { storeId: string | null }) {
  const [categories, setCategories] = useState<MenuEditorCategory[]>([]);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Record<string, boolean>>({});
  const [collapsedItemIds, setCollapsedItemIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLocalErr(null);
    setOkMsg(null);
    try {
      const r = await getMenuEditor(storeId);
      setCategories(r.categories);
      setCollapsedCategoryIds(
        Object.fromEntries(r.categories.map((c) => [c.id, true])) as Record<string, boolean>
      );
      setCollapsedItemIds(
        Object.fromEntries(
          r.categories.flatMap((c) => c.items.map((it) => [it.id, true]))
        ) as Record<string, boolean>
      );
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "menu_load_failed");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategoryIds((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const toggleItem = (itemId: string) => {
    setCollapsedItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setLocalErr(null);
    setOkMsg(null);
    try {
      await putMenuEditor(storeId, { categories });
      setOkMsg("Сохранено");
      await load();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "menu_save_failed");
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) {
    return <div className="text-sm text-zinc-600">Выберите точку вверху.</div>;
  }

  if (loading && categories.length === 0) {
    return <div className="text-sm text-zinc-600">Загружаем меню…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCategories((c) => [...c, emptyCategory()])}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
        >
          + Категория
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить меню"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
        >
          Обновить
        </button>
      </div>

      {localErr ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Ошибка: {localErr}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{okMsg}</div>
      ) : null}

      <p className="text-xs text-zinc-500">
        Остаток (штук) виден только здесь. Для гостя позиция скрывается, если выключена или остаток 0. «Без лимита» — поле
        остатка пустое.
      </p>

      <div className="space-y-6">
        {categories.map((cat, ci) => (
          <section key={cat.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-left text-sm font-semibold text-zinc-900"
                onClick={() => toggleCategory(cat.id)}
              >
                <span>{collapsedCategoryIds[cat.id] ? "▸" : "▾"}</span>
                <span>{cat.name || "Категория без названия"}</span>
                <span className="text-xs font-normal text-zinc-500">({cat.items.length})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-xs text-zinc-500">Категория</span>
                <input
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  value={cat.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCategories((prev) => prev.map((c, i) => (i === ci ? { ...c, name: v } : c)));
                  }}
                />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-zinc-500">Порядок</span>
                <input
                  type="number"
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  value={cat.sort_order}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCategories((prev) =>
                      prev.map((c, i) => (i === ci ? { ...c, sort_order: Number.isNaN(n) ? 0 : n } : c))
                    );
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                onClick={() => setCategories((prev) => prev.filter((_, i) => i !== ci))}
              >
                Удалить категорию
              </button>
            </div>

            {collapsedCategoryIds[cat.id] ? null : (
            <div className="mt-4 space-y-4">
              {cat.items.map((it, ii) => (
                <div key={it.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-left text-sm font-semibold text-zinc-900"
                      onClick={() => toggleItem(it.id)}
                    >
                      <span>{collapsedItemIds[it.id] ? "▸" : "▾"}</span>
                      <span>{it.name || "Позиция без названия"}</span>
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-700"
                      onClick={() =>
                        setCategories((prev) =>
                          prev.map((c, i) =>
                            i === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c
                          )
                        )
                      }
                    >
                      Удалить позицию
                    </button>
                  </div>

                  {collapsedItemIds[it.id] ? null : (
                  <>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Название</span>
                      <input
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={it.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? { ...c, items: c.items.map((x, j) => (j === ii ? { ...x, name: v } : x)) }
                                : c
                            )
                          );
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Цена (₽)</span>
                      <input
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={rublesFromCents(it.price_cents)}
                        onChange={(e) => {
                          const cents = centsFromRublesInput(e.target.value);
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? { ...c, items: c.items.map((x, j) => (j === ii ? { ...x, price_cents: cents } : x)) }
                                : c
                            )
                          );
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-xs text-zinc-500">Описание</span>
                      <input
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={it.description ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? { ...c, items: c.items.map((x, j) => (j === ii ? { ...x, description: v } : x)) }
                                : c
                            )
                          );
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-xs text-zinc-500">Фото (URL)</span>
                      <input
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        disabled={it.image_url === null}
                        value={it.image_url ?? ""}
                        placeholder="https://…"
                        onChange={(e) => {
                          const v = e.target.value.trim() || null;
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? { ...c, items: c.items.map((x, j) => (j === ii ? { ...x, image_url: v } : x)) }
                                : c
                            )
                          );
                        }}
                      />
                      <label className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={it.image_url === null}
                          onChange={(e) => {
                            const noPhoto = e.target.checked;
                            setCategories((prev) =>
                              prev.map((c, i) =>
                                i === ci
                                  ? {
                                      ...c,
                                      items: c.items.map((x, j) =>
                                        j === ii ? { ...x, image_url: noPhoto ? null : "" } : x
                                      ),
                                    }
                                  : c
                              )
                            );
                          }}
                        />
                        Без фото
                      </label>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Порядок</span>
                      <input
                        type="number"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={it.sort_order}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? {
                                    ...c,
                                    items: c.items.map((x, j) =>
                                      j === ii ? { ...x, sort_order: Number.isNaN(n) ? 0 : n } : x
                                    ),
                                  }
                                : c
                            )
                          );
                        }}
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.is_available}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? { ...c, items: c.items.map((x, j) => (j === ii ? { ...x, is_available: v } : x)) }
                                : c
                            )
                          );
                        }}
                      />
                      В продаже
                    </label>

                    <div className="sm:col-span-2">
                      <div className="text-xs text-zinc-500">Остаток (только для баристы)</div>
                      <label className="mt-1 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={it.stock_qty == null}
                          onChange={(e) => {
                            const unlimited = e.target.checked;
                            setCategories((prev) =>
                              prev.map((c, i) =>
                                i === ci
                                  ? {
                                      ...c,
                                      items: c.items.map((x, j) =>
                                        j === ii ? { ...x, stock_qty: unlimited ? null : x.stock_qty ?? 0 } : x
                                      ),
                                    }
                                  : c
                              )
                            );
                          }}
                        />
                        Без лимита
                      </label>
                      {it.stock_qty != null ? (
                        <input
                          type="number"
                          min={0}
                          className="mt-2 w-32 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={it.stock_qty}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setCategories((prev) =>
                              prev.map((c, i) =>
                                i === ci
                                  ? {
                                      ...c,
                                      items: c.items.map((x, j) =>
                                        j === ii ? { ...x, stock_qty: Number.isNaN(n) ? 0 : Math.max(0, n) } : x
                                      ),
                                    }
                                  : c
                              )
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-zinc-200 pt-3">
                    <div className="text-xs font-semibold text-zinc-700">Модификаторы</div>
                    <div className="mt-2 space-y-3">
                      {it.modifier_groups.map((g, gi) => (
                        <div key={g.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                          <div className="flex flex-wrap gap-2">
                            <input
                              className="min-w-[140px] flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                              value={g.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCategories((prev) =>
                                  prev.map((c, i) =>
                                    i === ci
                                      ? {
                                          ...c,
                                          items: c.items.map((x, j) =>
                                            j === ii
                                              ? {
                                                  ...x,
                                                  modifier_groups: x.modifier_groups.map((gg, k) =>
                                                    k === gi ? { ...gg, name: v } : gg
                                                  ),
                                                }
                                              : x
                                          ),
                                        }
                                      : c
                                  )
                                );
                              }}
                            />
                            <input
                              type="number"
                              className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                              title="min"
                              value={g.min_select}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setCategories((prev) =>
                                  prev.map((c, i) =>
                                    i === ci
                                      ? {
                                          ...c,
                                          items: c.items.map((x, j) =>
                                            j === ii
                                              ? {
                                                  ...x,
                                                  modifier_groups: x.modifier_groups.map((gg, k) =>
                                                    k === gi ? { ...gg, min_select: Number.isNaN(n) ? 0 : n } : gg
                                                  ),
                                                }
                                              : x
                                          ),
                                        }
                                      : c
                                  )
                                );
                              }}
                            />
                            <input
                              type="number"
                              className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                              title="max"
                              value={g.max_select}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setCategories((prev) =>
                                  prev.map((c, i) =>
                                    i === ci
                                      ? {
                                          ...c,
                                          items: c.items.map((x, j) =>
                                            j === ii
                                              ? {
                                                  ...x,
                                                  modifier_groups: x.modifier_groups.map((gg, k) =>
                                                    k === gi ? { ...gg, max_select: Number.isNaN(n) ? 0 : n } : gg
                                                  ),
                                                }
                                              : x
                                          ),
                                        }
                                      : c
                                  )
                                );
                              }}
                            />
                            <button
                              type="button"
                              className="text-sm text-red-700"
                              onClick={() =>
                                setCategories((prev) =>
                                  prev.map((c, i) =>
                                    i === ci
                                      ? {
                                          ...c,
                                          items: c.items.map((x, j) =>
                                            j === ii
                                              ? {
                                                  ...x,
                                                  modifier_groups: x.modifier_groups.filter((_, k) => k !== gi),
                                                }
                                              : x
                                          ),
                                        }
                                      : c
                                  )
                                )
                              }
                            >
                              Удалить группу
                            </button>
                          </div>
                          <div className="mt-2 space-y-1">
                            {g.options.map((op, oi) => (
                              <div key={op.id} className="flex flex-wrap gap-2">
                                <input
                                  className="min-w-[120px] flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                                  value={op.name}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCategories((prev) =>
                                      prev.map((c, i) =>
                                        i === ci
                                          ? {
                                              ...c,
                                              items: c.items.map((x, j) =>
                                                j === ii
                                                  ? {
                                                      ...x,
                                                      modifier_groups: x.modifier_groups.map((gg, k) =>
                                                        k === gi
                                                          ? {
                                                              ...gg,
                                                              options: gg.options.map((oo, m) =>
                                                                m === oi ? { ...oo, name: v } : oo
                                                              ),
                                                            }
                                                          : gg
                                                      ),
                                                    }
                                                  : x
                                              ),
                                            }
                                          : c
                                      )
                                    );
                                  }}
                                />
                                <span className="text-xs text-zinc-500">+₽</span>
                                <input
                                  className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                                  value={rublesFromCents(op.price_delta_cents)}
                                  onChange={(e) => {
                                    const cents = centsFromRublesInput(e.target.value);
                                    setCategories((prev) =>
                                      prev.map((c, i) =>
                                        i === ci
                                          ? {
                                              ...c,
                                              items: c.items.map((x, j) =>
                                                j === ii
                                                  ? {
                                                      ...x,
                                                      modifier_groups: x.modifier_groups.map((gg, k) =>
                                                        k === gi
                                                          ? {
                                                              ...gg,
                                                              options: gg.options.map((oo, m) =>
                                                                m === oi ? { ...oo, price_delta_cents: cents } : oo
                                                              ),
                                                            }
                                                          : gg
                                                      ),
                                                    }
                                                  : x
                                              ),
                                            }
                                          : c
                                      )
                                    );
                                  }}
                                />
                                <button
                                  type="button"
                                  className="text-xs text-red-700"
                                  onClick={() =>
                                    setCategories((prev) =>
                                      prev.map((c, i) =>
                                        i === ci
                                          ? {
                                              ...c,
                                              items: c.items.map((x, j) =>
                                                j === ii
                                                  ? {
                                                      ...x,
                                                      modifier_groups: x.modifier_groups.map((gg, k) =>
                                                        k === gi
                                                          ? {
                                                              ...gg,
                                                              options: gg.options.filter((_, m) => m !== oi),
                                                            }
                                                          : gg
                                                      ),
                                                    }
                                                  : x
                                              ),
                                            }
                                          : c
                                      )
                                    )
                                  }
                                >
                                  Удалить
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="text-sm text-zinc-700"
                              onClick={() =>
                                setCategories((prev) =>
                                  prev.map((c, i) =>
                                    i === ci
                                      ? {
                                          ...c,
                                          items: c.items.map((x, j) =>
                                            j === ii
                                              ? {
                                                  ...x,
                                                  modifier_groups: x.modifier_groups.map((gg, k) =>
                                                    k === gi ? { ...gg, options: [...gg.options, emptyOption()] } : gg
                                                  ),
                                                }
                                              : x
                                          ),
                                        }
                                      : c
                                  )
                                )
                              }
                            >
                              + Вариант
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-sm font-semibold text-zinc-800"
                        onClick={() =>
                          setCategories((prev) =>
                            prev.map((c, i) =>
                              i === ci
                                ? {
                                    ...c,
                                    items: c.items.map((x, j) =>
                                      j === ii ? { ...x, modifier_groups: [...x.modifier_groups, emptyGroup()] } : x
                                    ),
                                  }
                                : c
                            )
                          )
                        }
                      >
                        + Группа модификаторов
                      </button>
                    </div>
                  </div>
                  </>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-700"
                onClick={() =>
                  setCategories((prev) =>
                    prev.map((c, i) => (i === ci ? { ...c, items: [...c.items, emptyItem()] } : c))
                  )
                }
              >
                + Позиция в категории
              </button>
            </div>
            )}
          </section>
        ))}

        {categories.length === 0 ? (
          <div className="text-sm text-zinc-600">Категорий пока нет — добавьте первую.</div>
        ) : null}
      </div>
    </div>
  );
}
