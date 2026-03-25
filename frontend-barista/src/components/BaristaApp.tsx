"use client";

import { useEffect, useState } from "react";

import { getStores, listBaristaOrders, markOrderPaid, markOrderReady } from "@/lib/api";
import type { BaristaOrder, BaristaStore } from "@/lib/types";

import { BaristaMenuEditor } from "@/components/BaristaMenuEditor";
import { BaristaOrdersBoard } from "@/components/BaristaOrdersBoard";

export function BaristaApp() {
  const [stores, setStores] = useState<BaristaStore[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeClosed, setStoreClosed] = useState(false);

  const [tab, setTab] = useState<"orders" | "menu">("orders");

  const [paid, setPaid] = useState<BaristaOrder[]>([]);
  const [ready, setReady] = useState<BaristaOrder[]>([]);
  const [, setPrintedTick] = useState(0);
  const [dragOverReady, setDragOverReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const r = await getStores();
        setStores(r.stores);

        const saved = window.localStorage.getItem("barista:storeId");
        const initial = saved && r.stores.some((s) => s.id === saved) ? saved : r.stores[0]?.id ?? null;
        setStoreId(initial);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "stores_failed");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!storeId) return;
    window.localStorage.setItem("barista:storeId", storeId);
    const s = stores.find((x) => x.id === storeId);
    setStoreClosed(Boolean(s && !s.accepting_orders));
  }, [storeId, stores]);

  useEffect(() => {
    if (!storeId || tab !== "orders") return;

    let cancelled = false;
    let inFlight = false;
    let timeoutId: number | null = null;
    let delayMs = 2500;
    let lastKey: string | null = null;

    const computeKey = (paidOrders: BaristaOrder[], readyOrders: BaristaOrder[]) => {
      const paidIds = paidOrders.map((o) => o.order_id).join(",");
      const readyIds = readyOrders.map((o) => o.order_id).join(",");
      return `paid:${paidOrders.length}:${paidIds}|ready:${readyOrders.length}:${readyIds}`;
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => void fetchAll(), delayMs);
    };

    const fetchAll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const [p, r] = await Promise.all([
          listBaristaOrders(storeId, "paid"),
          listBaristaOrders(storeId, "ready"),
        ]);
        if (cancelled) return;
        setPaid(p.orders);
        setReady(r.orders);

        const key = computeKey(p.orders, r.orders);
        if (lastKey === key) {
          // No changes: backoff polling to reduce load.
          delayMs = Math.min(delayMs * 2, 10000);
        } else {
          delayMs = 2500;
          lastKey = key;
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "orders_failed");
      } finally {
        inFlight = false;
      }
    };

    void fetchAll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [storeId, tab]);

  const printedKey = (orderId: string) => `barista:printed:${orderId}`;

  const selectedStore = storeId ? stores.find((s) => s.id === storeId) : undefined;
  const queueCount = paid.length;
  const doneCount = ready.length;

  const onDropReady = async (orderId: string) => {
    if (storeClosed) return;
    try {
      await markOrderReady(orderId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "mark_ready_failed");
    }
  };

  const [dragOverPaid, setDragOverPaid] = useState(false);

  const onDropPaid = async (orderId: string) => {
    if (storeClosed) return;
    try {
      await markOrderPaid(orderId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "mark_paid_failed");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">Coffee Stop — Barista</div>
            <div className="text-xs text-zinc-500">
              {selectedStore ? (
                <>
                  <div className="truncate font-medium text-zinc-800">{selectedStore.name}</div>
                  <div className="mt-0.5 text-zinc-500">
                    В очереди: {queueCount} · Готово: {doneCount}
                    {storeClosed ? " — ЗАКРЫТА" : ""}
                  </div>
                </>
              ) : (
                "Выберите точку"
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={storeId ?? ""}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={loading || stores.length === 0}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.slug} — {s.name}
                  {s.accepting_orders ? "" : " (ЗАКРЫТА)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 pb-0 pt-1">
          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("orders")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold text-zinc-900 ${
                tab === "orders" ? "border-zinc-900" : "border-transparent text-zinc-500"
              }`}
            >
              Заказы
            </button>
            <button
              type="button"
              onClick={() => setTab("menu")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold text-zinc-900 ${
                tab === "menu" ? "border-zinc-900" : "border-transparent text-zinc-500"
              }`}
            >
              Меню точки
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {err ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Ошибка: {err}
          </div>
        ) : null}

        {tab === "orders" ? (
          <BaristaOrdersBoard
            paid={paid}
            ready={ready}
            storeClosed={storeClosed}
            dragOverPaid={dragOverPaid}
            setDragOverPaid={setDragOverPaid}
            dragOverReady={dragOverReady}
            setDragOverReady={setDragOverReady}
            onDropPaid={onDropPaid}
            onDropReady={onDropReady}
            onError={setErr}
            printedKey={printedKey}
            setPrintedTick={setPrintedTick}
          />
        ) : (
          <BaristaMenuEditor key={storeId ?? "none"} storeId={storeId} />
        )}
      </main>
    </div>
  );
}
