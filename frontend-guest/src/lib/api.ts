import type { CheckoutOut, CreateOrderIn, CreateOrderOut, OrderStatusOut, StoreMenu } from "@/lib/types";

function apiBaseUrl(): string {
  // In production we deploy guest on `guest.<domain>` and API on `api.<domain>`.
  // On the browser we can infer the API host from `window.location`.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    if (host.startsWith("guest.")) {
      const apiHost = host.replace("guest.", "api.");
      return `${proto}//${apiHost}/api/v1`;
    }
    if (host.startsWith("barista.")) {
      const apiHost = host.replace("barista.", "api.");
      return `${proto}//${apiHost}/api/v1`;
    }
    if (host.startsWith("api.")) {
      return `${proto}//${host}/api/v1`;
    }

    // Local dev fallback (e.g. guest runs on localhost:3000).
    const v = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (v) return v.replace(/\/+$/, "");
    const internal = process.env.API_INTERNAL_BASE_URL;
    if (internal) return internal.replace(/\/+$/, "");
    return "http://127.0.0.1:8000/api/v1";
  }

  // SSR fallback
  const v = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (v) return v.replace(/\/+$/, "");
  const internal = process.env.API_INTERNAL_BASE_URL;
  if (internal) return internal.replace(/\/+$/, "");
  return "http://127.0.0.1:8000/api/v1";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: init?.cache ?? "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getStoreMenu(slug: string, qrToken?: string | null): Promise<StoreMenu> {
  // Меню можно кэшировать коротко, чтобы навигация была быстрее.
  const tokenQuery = qrToken ? `?t=${encodeURIComponent(qrToken)}` : "";
  return await apiFetch<StoreMenu>(`/public/stores/${encodeURIComponent(slug)}/menu${tokenQuery}`, {
    cache: "force-cache",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next: { revalidate: 10 } as any,
  } as unknown as RequestInit);
}

export async function getStoreMenuLive(slug: string, qrToken?: string | null): Promise<StoreMenu> {
  // For client-side refresh we want the latest menu (no cache).
  const tokenQuery = qrToken ? `?t=${encodeURIComponent(qrToken)}` : "";
  return await apiFetch<StoreMenu>(`/public/stores/${encodeURIComponent(slug)}/menu${tokenQuery}`, {
    cache: "no-store",
  });
}

export async function createOrder(slug: string, payload: CreateOrderIn): Promise<CreateOrderOut> {
  return await apiFetch<CreateOrderOut>(`/public/stores/${encodeURIComponent(slug)}/orders`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkout(orderId: string): Promise<CheckoutOut> {
  try {
    return await apiFetch<CheckoutOut>(
      `/public/orders/${encodeURIComponent(orderId)}/checkout/tochka`,
      {
        method: "POST",
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    // Пока секреты Tochka не настроены (или endpoint не готов) — откатываемся на mock.
    if (msg.includes("tochka_not_configured")) {
      return await apiFetch<CheckoutOut>(`/public/orders/${encodeURIComponent(orderId)}/checkout`, {
        method: "POST",
      });
    }
    throw e;
  }
}

export async function getOrderStatus(orderId: string): Promise<OrderStatusOut> {
  return await apiFetch<OrderStatusOut>(`/public/orders/${encodeURIComponent(orderId)}/status`);
}

