"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { checkout, createOrder, getStoreMenu } from "@/lib/api";
import { requestNotificationPermissionFromUser } from "@/lib/notifications";
import { isValidEmail } from "@/lib/validation";
import { useCart } from "@/lib/useCart";
import type { StoreMenu } from "@/lib/types";

function apiOrigin(): string {
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

    const v = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (v) return v.replace(/\/api\/v1$/, "").replace(/\/+$/, "");
    return "http://127.0.0.1:8000";
  }

  const internal = process.env.API_INTERNAL_BASE_URL;
  if (internal) return internal.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return "http://localhost:8000";
}

export default function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [menu, setMenu] = useState<StoreMenu | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
  }, [slug, qrToken]);

  const title = menu?.store?.name ?? "Оплата";
  const emailOk = useMemo(() => isValidEmail(cart.guestEmail), [cart.guestEmail]);
  const hasLines = cart.lines.length > 0;

  const runCheckout = async () => {
    if (!emailOk || !hasLines) return;
    setSubmitting(true);
    setErr(null);
    try {
      // С user gesture (клик по кнопке) — иначе многие браузеры не показывают запрос разрешения.
      await requestNotificationPermissionFromUser();

      const order = await createOrder(slug, {
        lines: cart.lines.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
          modifier_option_ids: l.modifier_option_ids,
        })),
        guest_email: cart.guestEmail,
      });
      const co = await checkout(order.order_id);

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
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader slug={slug} title={title} />
      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Оплата</div>
          <div className="mt-1 text-sm text-zinc-600">
            Нажмите кнопку ниже — мы запросим разрешение на уведомление о готовности (если браузер спросит), создадим заказ и
            откроем оплату банка.
          </div>
          {!emailOk ? <div className="mt-3 text-sm text-red-700">Нужен корректный email.</div> : null}
          {!hasLines ? <div className="mt-3 text-sm text-red-700">Корзина пустая.</div> : null}
          {err ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Ошибка: <span className="font-mono">{err}</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={submitting || !emailOk || !hasLines}
            onClick={() => void runCheckout()}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Создаём заказ…" : "Перейти к оплате"}
          </button>

          <div className="mt-4 flex gap-2">
            <Link
              href={withQr(`/s/${encodeURIComponent(slug)}/cart`)}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Назад в корзину
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
