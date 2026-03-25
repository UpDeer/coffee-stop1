"use client";

import { useSyncExternalStore } from "react";

import type { CartState } from "@/lib/cart";

const EMPTY_CART: CartState = { lines: [], guestEmail: "" };

type CacheEntry = {
  raw: string | null;
  snapshot: CartState;
};

const cacheBySlug = new Map<string, CacheEntry>();

function cartKey(slug: string) {
  return `cart:${slug}`;
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("cart:")) callback();
  };
  const onCustom = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener("cart:change", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("cart:change", onCustom);
  };
}

export function useCart(slug: string): CartState {
  const getSnapshot = () => {
    const key = cartKey(slug);
    const raw = window.localStorage.getItem(key);
    const cached = cacheBySlug.get(slug);
    if (cached && cached.raw === raw) return cached.snapshot;

    let snapshot: CartState = EMPTY_CART;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<CartState>;
        snapshot = {
          lines: Array.isArray(parsed.lines) ? (parsed.lines as CartState["lines"]) : [],
          guestEmail: typeof parsed.guestEmail === "string" ? parsed.guestEmail : "",
        };
      } catch {
        snapshot = EMPTY_CART;
      }
    }

    cacheBySlug.set(slug, { raw, snapshot });
    return snapshot;
  };

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_CART
  );
}

