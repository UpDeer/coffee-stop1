-- Параметры товара (например, объём) на уровне категории + значения на уровне позиции.
-- Выполнить вручную на существующей БД.

ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS item_params_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS item_params JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS item_params_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

