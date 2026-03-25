import type { MenuItem, ModifierOption, StoreMenu } from "@/lib/types";

export type CartLine = {
  id: string;
  menu_item_id: string;
  quantity: number;
  modifier_option_ids: string[];
};

export type CartState = {
  lines: CartLine[];
  guestEmail: string;
};

function cartKey(slug: string) {
  return `cart:${slug}`;
}

export function loadCart(slug: string): CartState {
  if (typeof window === "undefined") return { lines: [], guestEmail: "" };
  const raw = window.localStorage.getItem(cartKey(slug));
  if (!raw) return { lines: [], guestEmail: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<CartState>;
    return {
      lines: Array.isArray(parsed.lines) ? (parsed.lines as CartLine[]) : [],
      guestEmail: typeof parsed.guestEmail === "string" ? parsed.guestEmail : "",
    };
  } catch {
    return { lines: [], guestEmail: "" };
  }
}

export function saveCart(slug: string, state: CartState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cartKey(slug), JSON.stringify(state));
  window.dispatchEvent(new Event("cart:change"));
}

export function clearCart(slug: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(cartKey(slug));
  window.dispatchEvent(new Event("cart:change"));
}

export function addLine(slug: string, line: Omit<CartLine, "id">) {
  const state = loadCart(slug);
  const id = crypto.randomUUID();
  const next: CartState = { ...state, lines: [...state.lines, { ...line, id }] };
  saveCart(slug, next);
  return next;
}

export function updateLine(slug: string, id: string, patch: Partial<Omit<CartLine, "id">>) {
  const state = loadCart(slug);
  const nextLines = state.lines.map((l) => (l.id === id ? { ...l, ...patch } : l));
  const next = { ...state, lines: nextLines };
  saveCart(slug, next);
  return next;
}

export function removeLine(slug: string, id: string) {
  const state = loadCart(slug);
  const next = { ...state, lines: state.lines.filter((l) => l.id !== id) };
  saveCart(slug, next);
  return next;
}

export function setGuestEmail(slug: string, guestEmail: string) {
  const state = loadCart(slug);
  const next = { ...state, guestEmail };
  saveCart(slug, next);
  return next;
}

export type CartLineView = {
  id: string;
  item: MenuItem | null;
  quantity: number;
  options: ModifierOption[];
  lineTotalCents: number;
};

export function buildCartView(menu: StoreMenu, cart: CartState): { lines: CartLineView[]; totalCents: number } {
  const itemsById = new Map<string, MenuItem>();
  const optionsById = new Map<string, ModifierOption>();

  for (const c of menu.categories) {
    for (const it of c.items) {
      itemsById.set(it.id, it);
      for (const g of it.modifier_groups) {
        for (const o of g.options) optionsById.set(o.id, o);
      }
    }
  }

  const lines: CartLineView[] = cart.lines.map((l) => {
    const item = itemsById.get(l.menu_item_id) ?? null;
    const opts = l.modifier_option_ids.map((id) => optionsById.get(id)).filter(Boolean) as ModifierOption[];
    const unit = (item?.price_cents ?? 0) + opts.reduce((s, o) => s + (o.price_delta_cents ?? 0), 0);
    const lineTotalCents = unit * l.quantity;
    return {
      id: l.id,
      item,
      quantity: l.quantity,
      options: opts,
      lineTotalCents,
    };
  });

  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  return { lines, totalCents };
}

