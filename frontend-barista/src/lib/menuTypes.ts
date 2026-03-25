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

export type MenuEditorItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  is_available: boolean;
  sort_order: number;
  stock_qty: number | null;
  modifier_groups: MenuEditorModifierGroup[];
};

export type MenuEditorCategory = {
  id: string;
  name: string;
  sort_order: number;
  items: MenuEditorItem[];
};

export type MenuEditorResponse = {
  store: { id: string; slug: string; name: string };
  categories: MenuEditorCategory[];
};
