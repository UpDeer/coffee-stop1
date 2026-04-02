export type MenuEditorModifierOption = {
  id: string;
  name: string;
  price_delta_cents: number;
  sort_order: number;
};

export type MenuEditorModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: MenuEditorModifierOption[];
};

export type ItemParamField = {
  key: string; // e.g. "volume_ml"
  label: string; // e.g. "Объём"
  unit?: string | null; // e.g. "мл"
  type?: "number" | "text";
};

export type MenuEditorItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  is_available: boolean;
  sort_order: number;
  stock_qty: number | null;
  item_params: Record<string, unknown>;
  modifier_groups: MenuEditorModifierGroup[];
};

export type MenuEditorCategory = {
  id: string;
  name: string;
  sort_order: number;
  item_params_schema: ItemParamField[];
  items: MenuEditorItem[];
};

export type MenuEditorResponse = {
  store: { id: string; slug: string; name: string };
  categories: MenuEditorCategory[];
};
