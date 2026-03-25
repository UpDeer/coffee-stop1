export type BaristaStore = {
  id: string;
  slug: string;
  name: string;
  accepting_orders: boolean;
};

export type BaristaOrderLine = {
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  modifiers: Array<{ name: string; price_delta_cents: number }>;
};

export type BaristaOrder = {
  order_id: string;
  status: "paid" | "ready";
  public_number: number | null;
  created_at: string | null;
  total_cents: number;
  fiscal_status: "pending" | "done" | "failed";
  fiscal_last_error: string | null;
  lines: BaristaOrderLine[];
};

export type BaristaOrdersResponse = {
  orders: BaristaOrder[];
};

