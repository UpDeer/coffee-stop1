-- Добавить остаток для позиций меню (бариста). Выполнить вручную на существующей БД.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS stock_qty INT CHECK (stock_qty IS NULL OR stock_qty >= 0);
