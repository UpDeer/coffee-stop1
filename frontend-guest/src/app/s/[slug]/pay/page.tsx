"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { checkout, createOrder, getStoreMenu } from "@/lib/api";
import { isValidEmail } from "@/lib/validation";
import { useCart } from "@/lib/useCart";
import type { StoreMenu } from "@/lib/types";

function apiOrigin(): string {
  // For mock payment redirects `payment_url` can be relative.
  // We need the public API origin to call it from the browser.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    if (host.startsWith("guest.")) {
      const apiHost = host.replace("guest.", "api.");
      return `${proto}//${apiHost}`;
    }
    if (host.startsWith("barista.")) {
      const apiHost = host.replace("barista.", "api.");
      return `${proto}//${apiHost}`;
    }
    if (host.startsWith("api.")) {
      return `${proto}//${host}`;
    }

    // Local dev fallback (e.g. guest on localhost:3000).
    const v = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (v) return v.replace(/\/api\/v1$/, "").replace(/\/+$/, "");
    return "http://127.0.0.1:8000";
  }

  // SSR fallback (should be rare for this client page).
  const internal = process.env.API_INTERNAL_BASE_URL;
  if (internal) return internal.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return "http://localhost:8000";
}

export default function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next.js 16: в client-компонентах `params` может быть Promise.
  // React.use() разворачивает promise синхронно во время рендера.
  const { slug } = use(params);
  const router = useRouter();
  const [menu, setMenu] = useState<StoreMenu | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);
  const cart = useCart(slug);

  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");
  const withQr = useMemo(() => {
    return (href: string) => {
      if (!qrToken) return href;
      const sep = href.includes("?") ? "&" : "?";
      return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
    };
  }, [qrToken]);

  useEffect(() => {
    getStoreMenu(slug, qrToken).then(setMenu).catch(() => setMenu(null));
  }, [slug, qrToken, setMenu]);

  const title = menu?.store?.name ?? "Оплата";
  const emailOk = useMemo(() => isValidEmail(cart.guestEmail), [cart.guestEmail]);
  const hasLines = cart.lines.length > 0;

  useEffect(() => {
    if (!emailOk) return;
    if (!hasLines) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      setSubmitting(true);
      setErr(null);

      try {
        // Request notification permission right before starting checkout.
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "default") {
            try {
              await Notification.requestPermission();
            } catch {
              // ignore
            }
          }
        }

        const order = await createOrder(slug, {
          lines: cart.lines.map((l) => ({
            menu_item_id: l.menu_item_id,
            quantity: l.quantity,
            modifier_option_ids: l.modifier_option_ids,
          })),
          guest_email: cart.guestEmail,
        });
        const co = await checkout(order.order_id);

        // В dev-сценарии payment_url может быть относительным (mock webhook).
        // Тогда дергаем его как API и ведем гостя на экран статуса заказа.
        if (co.payment_url.startsWith("/")) {
          const url = `${apiOrigin()}${co.payment_url}`;
          await fetch(url, { method: "POST" });
          router.replace(withQr(`/s/${encodeURIComponent(slug)}/order/${encodeURIComponent(order.order_id)}`));
          return;
        }

        window.location.href = co.payment_url;
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "checkout_failed");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [cart.guestEmail, cart.lines, emailOk, hasLines, retryNonce, router, slug, withQr]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title={title} />
      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Переходим к оплате…</div>
          <div className="mt-1 text-sm text-zinc-600">
            Сейчас мы создадим заказ и откроем страницу оплаты банка.
          </div>
          {!emailOk ? (
            <div className="mt-3 text-sm text-red-700">Нужен корректный email.</div>
          ) : null}
          {!hasLines ? (
            <div className="mt-3 text-sm text-red-700">Корзина пустая.</div>
          ) : null}
          {err ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Ошибка: <span className="font-mono">{err}</span>
            </div>
          ) : null}

          {err ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setErr(null);
                startedRef.current = false;
                setRetryNonce((n) => n + 1);
              }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Попробовать снова
            </button>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Link
              href={withQr(`/s/${encodeURIComponent(slug)}/cart`)}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Назад в корзину
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

