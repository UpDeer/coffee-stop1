import type { MenuEditorCategory, MenuEditorResponse } from "@/lib/menuTypes";
import type { BaristaOrdersResponse, BaristaStore } from "@/lib/types";

function apiBaseUrl(): string {
  // Production deploys:
  // - barista on `barista.<domain>`
  // - API on `api.<domain>`
  // On the browser, infer `api.*` from `window.location`.
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

    // Local dev fallback (e.g. barista runs on localhost:3003).
    const v = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (v) return v.replace(/\/+$/, "");
    const internal = process.env.API_INTERNAL_BASE_URL;
    if (internal) return internal.replace(/\/+$/, "");
    return "http://127.0.0.1:8000/api/v1";
  }

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

export async function getStores(): Promise<{ stores: BaristaStore[] }> {
  return await apiFetch<{ stores: BaristaStore[] }>(`/public/stores`);
}

export async function listBaristaOrders(storeId: string, status: "paid" | "ready"): Promise<BaristaOrdersResponse> {
  return await apiFetch<BaristaOrdersResponse>(
    `/barista/stores/${encodeURIComponent(storeId)}/orders?status=${status}`
  );
}

export async function markOrderReady(orderId: string): Promise<{ status: string }> {
  return await apiFetch<{ status: string }>(`/barista/orders/${encodeURIComponent(orderId)}/ready`, {
    method: "POST",
  });
}

export async function markOrderPaid(orderId: string): Promise<{ status: string }> {
  return await apiFetch<{ status: string }>(`/barista/orders/${encodeURIComponent(orderId)}/paid`, {
    method: "POST",
  });
}

export async function getMenuEditor(storeId: string): Promise<MenuEditorResponse> {
  return await apiFetch<MenuEditorResponse>(`/barista/stores/${encodeURIComponent(storeId)}/menu-editor`);
}

export async function putMenuEditor(
  storeId: string,
  body: { categories: MenuEditorCategory[] }
): Promise<{ ok: boolean }> {
  return await apiFetch<{ ok: boolean }>(`/barista/stores/${encodeURIComponent(storeId)}/menu-editor`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

