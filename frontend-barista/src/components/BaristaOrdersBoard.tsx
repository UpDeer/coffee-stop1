"use client";

import type { Dispatch, SetStateAction } from "react";

import type { BaristaOrder, BaristaOrderLine } from "@/lib/types";

function formatRublesFromCents(amountCents: number) {
  const rub = amountCents / 100;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(rub);
}

function OrderLinesList({ lines }: { lines: BaristaOrderLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="mt-2 list-none space-y-1 pl-0 text-xs text-zinc-600">
      {lines.map((l, idx) => (
        <li key={idx} className="leading-snug">
          <span className="tabular-nums font-medium text-zinc-700">{l.quantity}×</span> {l.name}
          {l.item_params_display?.length ? (
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {l.item_params_display
                .map((p) => `${p.label}: ${String(p.value)}${p.unit ? ` ${p.unit}` : ""}`)
                .join(" · ")}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function BaristaOrdersBoard({
  paid,
  ready,
  storeClosed,
  dragOverPaid,
  setDragOverPaid,
  dragOverReady,
  setDragOverReady,
  onDropPaid,
  onDropReady,
  onMarkReady,
  onError,
  printedKey,
  setPrintedTick,
}: {
  paid: BaristaOrder[];
  ready: BaristaOrder[];
  storeClosed: boolean;
  dragOverPaid: boolean;
  setDragOverPaid: (v: boolean) => void;
  dragOverReady: boolean;
  setDragOverReady: (v: boolean) => void;
  onDropPaid: (orderId: string) => void | Promise<void>;
  onDropReady: (orderId: string) => void | Promise<void>;
  onMarkReady: (orderId: string) => void | Promise<void>;
  onError: (msg: string) => void;
  printedKey: (orderId: string) => string;
  setPrintedTick: Dispatch<SetStateAction<number>>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Новые (paid)</h2>
        <div
          className={`mt-3 flex flex-col gap-3 transition-colors ${
            dragOverPaid ? "border border-zinc-900/20 bg-zinc-50 rounded-xl p-1" : ""
          }`}
          onDragOver={(e) => {
            if (storeClosed) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverPaid(true);
          }}
          onDragLeave={() => setDragOverPaid(false)}
          onDrop={(e) => {
            if (storeClosed) return;
            e.preventDefault();
            setDragOverPaid(false);
            const orderId = e.dataTransfer.getData("text/plain");
            if (orderId) void onDropPaid(orderId);
          }}
        >
          {paid.length ? (
            paid.map((o) => (
              <div
                key={o.order_id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                draggable={!storeClosed && o.fiscal_status === "done"}
                onDragStart={(e) => {
                  if (storeClosed) return;
                  if (o.fiscal_status !== "done") return;
                  e.dataTransfer.setData("text/plain", o.order_id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="cursor-grab select-none text-lg text-zinc-400"
                    draggable={!storeClosed && o.fiscal_status === "done"}
                    onDragStart={(e) => {
                      if (storeClosed) return;
                      if (o.fiscal_status !== "done") return;
                      e.dataTransfer.setData("text/plain", o.order_id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    title="Перетащить в готовится/готово"
                  >
                    ⠿
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-500">Заказ</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-900">{o.public_number ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-500">Сумма</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{formatRublesFromCents(o.total_cents)}</div>
                  </div>
                </div>

                <OrderLinesList lines={o.lines} />

                {o.fiscal_status !== "done" ? (
                  <div className="mt-2 text-xs text-zinc-600">
                    {o.fiscal_status === "pending"
                      ? "Формируем чек (фискализация...)"
                      : "Чек не сформирован. По регламенту (повтор/звонок/ручная обработка)."}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={storeClosed || o.fiscal_status !== "done"}
                  onClick={async () => {
                    try {
                      await onMarkReady(o.order_id);
                    } catch (e: unknown) {
                      onError(e instanceof Error ? e.message : "mark_ready_failed");
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Готово
                </button>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-600">Пока пусто.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Готово (ready)</h2>
        <div
          className={`mt-3 flex flex-col gap-3 transition-colors ${
            dragOverReady ? "border border-zinc-900/20 bg-zinc-50" : ""
          } rounded-xl p-1`}
          onDragOver={(e) => {
            if (storeClosed) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverReady(true);
          }}
          onDragLeave={() => setDragOverReady(false)}
          onDrop={(e) => {
            if (storeClosed) return;
            e.preventDefault();
            setDragOverReady(false);
            const orderId = e.dataTransfer.getData("text/plain");
            if (orderId) void onDropReady(orderId);
          }}
        >
          {ready.length ? (
            ready.map((o) => {
              const done = window.localStorage.getItem(printedKey(o.order_id)) === "1";
              return (
                <div
                  key={o.order_id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                  draggable={!storeClosed}
                  onDragStart={(e) => {
                    if (storeClosed) return;
                    e.dataTransfer.setData("text/plain", o.order_id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="cursor-grab select-none text-lg text-zinc-400"
                      draggable={!storeClosed}
                      onDragStart={(e) => {
                        if (storeClosed) return;
                        e.dataTransfer.setData("text/plain", o.order_id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      title="Перетащить в готовится"
                    >
                      ⠿
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-zinc-500">Заказ</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-900">{o.public_number ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500">Сумма</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {formatRublesFromCents(o.total_cents)}
                      </div>
                    </div>
                  </div>

                  <OrderLinesList lines={o.lines} />

                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="text-xs text-zinc-500">Печать (stub)</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{done ? "Done" : "Pending"}</div>
                    <button
                      type="button"
                      disabled={storeClosed || done}
                      onClick={() => {
                        window.localStorage.setItem(printedKey(o.order_id), "1");
                        setPrintedTick((x) => x + 1);
                      }}
                      className="mt-2 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Отметить (печать завершена)
                    </button>
                    {storeClosed ? (
                      <div className="mt-2 text-xs text-zinc-500">Точка закрыта — действия отключены.</div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-zinc-600">Пока пусто.</div>
          )}
        </div>
      </section>
    </div>
  );
}
