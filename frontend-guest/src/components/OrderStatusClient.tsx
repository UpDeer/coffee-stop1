"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { clearCart } from "@/lib/cart";
import { getOrderStatus } from "@/lib/api";
import { formatRublesFromCents } from "@/lib/money";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      status: string;
      publicNumber: number | null;
      readyAt: string | null;
      totalCents: number;
      lines: Array<{
        id: string;
        name: string;
        quantity: number;
        unit_price_cents: number;
        line_total_cents: number;
        modifiers: Array<{ name: string; price_delta_cents: number }>;
      }>;
    };

function statusText(status: string): { title: string; body: string } {
  switch (status) {
    case "payment_pending":
      return { title: "Ждём подтверждение оплаты", body: "Обычно это занимает несколько секунд." };
    case "paid":
      return { title: "Заказ принят", body: "Бариста уже готовит. Как будет готов — статус обновится." };
    case "ready":
      return { title: "Готово", body: "Можно забирать на столе выдачи по номеру заказа." };
    default:
      return { title: `Статус: ${status}`, body: "Обновите страницу через минуту." };
  }
}

export function OrderStatusClient({ slug, orderId }: { slug: string; orderId: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const prevStatusRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timeoutId: number | null = null;

    const scheduleNext = (ms: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const s = await getOrderStatus(orderId);
        if (cancelled) return;

        const prev = prevStatusRef.current;
        prevStatusRef.current = s.status;

        if (s.status === "paid" && prev !== "paid") {
          clearCart(slug);
        }

        setState({
          kind: "ok",
          status: s.status,
          publicNumber: s.public_number,
          readyAt: s.ready_at,
          totalCents: s.total_cents,
          lines: s.lines,
        });

        // Notify when the order becomes ready (Web Notification).
        if (s.status === "ready" && prev !== "ready") {
          if (typeof window !== "undefined" && "Notification" in window) {
            const notify = () => {
              try {
                new Notification("Заказ готов", {
                  body: s.public_number ? `Номер: ${s.public_number}` : "Можно забирать на столе выдачи.",
                });
              } catch {
                // ignore notification failures
              }
            };

            if (Notification.permission === "granted") {
              notify();
            } else if (Notification.permission === "default") {
              void Notification.requestPermission().then((p) => {
                if (p === "granted") notify();
              });
            }
          }
        }

        // Polling policy to reduce load:
        // - stop when ready
        // - slow down during payment_pending
        if (s.status === "ready" || s.status === "payment_failed") return;
        if (s.status === "payment_pending") {
          scheduleNext(6000);
        } else {
          // paid (and any other intermediate status)
          scheduleNext(2500);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : "status_failed" });

        // Backoff on error
        scheduleNext(5000);
      } finally {
        inFlight = false;
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [orderId, slug]);

  const content = useMemo(() => {
    if (state.kind === "loading") return { title: "Загружаем статус…", body: "" };
    if (state.kind === "error") return { title: "Ошибка", body: state.message };
    return statusText(state.status);
  }, [state]);

  const publicNumber = state.kind === "ok" ? state.publicNumber : null;
  const lines = state.kind === "ok" ? state.lines : [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title="Статус заказа" />

      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold text-zinc-900">{content.title}</div>
          {content.body ? <div className="mt-2 text-sm text-zinc-600">{content.body}</div> : null}

          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500 text-center">Номер заказа</div>
            <div className="mt-1 text-center text-3xl font-semibold tracking-tight text-zinc-900">
              {publicNumber ?? "—"}
            </div>

            {state.kind === "ok" ? (
              <div className="mt-3">
                <div className="text-xs text-zinc-500">Состав</div>
                <div className="mt-2 flex flex-col gap-2">
                  {lines.length ? (
                    lines.map((l) => (
                      <div key={l.id} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {l.quantity}x {l.name}
                          </div>
                          {l.modifiers.length ? (
                            <div className="mt-0.5 text-xs text-zinc-600">{l.modifiers.map((m) => m.name).join(", ")}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-zinc-900">{formatRublesFromCents(l.line_total_cents)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-600">Состав недоступен.</div>
                  )}
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Время ожидания:{" "}
                  {state.status === "payment_pending"
                    ? "Обычно подтверждение занимает несколько секунд."
                    : state.status === "paid"
                      ? "Обычно готовность через 5–8 минут."
                      : state.status === "ready"
                        ? "Готово — можно забирать."
                        : "Обновляйте страницу через минуту."}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex gap-2">
            <Link
              href={withQr(`/s/${encodeURIComponent(slug)}`)}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              В меню
            </Link>
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            Редирект после оплаты не подтверждает платёж. Статус меняется после подтверждения на сервере.
          </div>
        </div>
      </main>
    </div>
  );
}

