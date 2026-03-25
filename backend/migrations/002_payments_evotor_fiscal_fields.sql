-- Evotor Digital Cashbox fiscalization tracking for orders/payments
-- Применить вручную на существующей БД по аналогии с 001_*.sql

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS fiscal_status TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_provider TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_uuid TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_payload JSONB,
  ADD COLUMN IF NOT EXISTS fiscal_result_payload JSONB,
  ADD COLUMN IF NOT EXISTS fiscal_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiscal_last_error TEXT;

