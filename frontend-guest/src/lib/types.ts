export type StoreRef = {
  id: string;
  slug: string;
  name: string;
};

export type ModifierOption = {
  id: string;
  name: string;
  price_delta_cents: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  is_available: boolean;
  item_params?: Record<string, unknown>;
  modifier_groups: ModifierGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  item_params_schema?: Array<{
    key: string;
    label: string;
    unit?: string | null;
    type?: "number" | "text";
  }>;
  items: MenuItem[];
};

export type StoreMenu = {
  store: StoreRef;
  categories: MenuCategory[];
};

export type CreateOrderInLine = {
  menu_item_id: string;
  quantity: number;
  modifier_option_ids: string[];
};

export type CreateOrderIn = {
  lines: CreateOrderInLine[];
  guest_email?: string | null;
};

export type CreateOrderOut = {
  order_id: string;
  status: "draft";
  store: StoreRef;
  subtotal_cents: number;
  total_cents: number;
};

export type CheckoutOut = {
  order_id: string;
  status: "payment_pending";
  payment_url: string;
};

export type OrderStatusOut = {
  order_id: string;
  status: "draft" | "payment_pending" | "paid" | "ready" | "picked_up" | "cancelled" | "refunded";
  public_number: number | null;
  ready_at: string | null;
  created_at: string | null;
  total_cents: number;
  estimated_wait_minutes: number | null;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    item_params?: Record<string, unknown>;
    item_params_display?: Array<{ key: string; label: string; value: unknown; unit?: string | null }>;
    modifiers: Array<{
      name: string;
      price_delta_cents: number;
    }>;
  }>;
};

