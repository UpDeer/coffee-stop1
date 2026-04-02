-- Coffee Stop Soft — ядро БД (PostgreSQL), этап 1
-- Миграции позже: Alembic / Flyway / prisma migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE order_status AS ENUM (
  'draft',
  'payment_pending',
  'paid',
  'ready',
  'picked_up',
  'cancelled',
  'refunded'
);

CREATE TYPE print_job_status AS ENUM (
  'pending',
  'printing',
  'done',
  'failed'
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  accepting_orders BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  -- Схема параметров позиций этой категории (например, "Объём (мл)" для напитков).
  -- Формат: JSON array.
  item_params_schema JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES menu_categories (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  -- NULL = без лимита; 0 = нет в наличии (для гостя скрыто вместе с is_available)
  stock_qty INT CHECK (stock_qty IS NULL OR stock_qty >= 0),
  -- Значения параметров (по ключу) для этой позиции, напр. {"volume_ml": 300}
  item_params JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_select INT NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INT NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES modifier_groups (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_cents INT NOT NULL DEFAULT 0 CHECK (price_delta_cents >= 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'draft',
  public_number INT,
  public_number_date DATE,
  guest_email TEXT,
  guest_push_subscription JSONB,
  subtotal_cents INT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  total_cents INT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  idempotency_key TEXT UNIQUE,
  payment_provider TEXT,
  payment_provider_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  UNIQUE (store_id, public_number_date, public_number)
);

CREATE INDEX idx_orders_store_status_created ON orders (store_id, status, created_at);

CREATE TABLE order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  menu_item_name_snapshot TEXT NOT NULL,
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  quantity INT NOT NULL CHECK (quantity >= 1),
  line_total_cents INT NOT NULL CHECK (line_total_cents >= 0),
  -- Снимок параметров позиции на момент заказа (чтобы не зависеть от будущих правок меню)
  item_params_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE order_line_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id UUID NOT NULL REFERENCES order_lines (id) ON DELETE CASCADE,
  modifier_option_id UUID REFERENCES modifier_options (id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  price_delta_cents INT NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_payload JSONB,
  -- Evotor Digital Cashbox (ATOL-compatible) fiscalization tracking
  fiscal_status TEXT,
  fiscal_provider TEXT,
  fiscal_uuid TEXT,
  fiscal_payload JSONB,
  fiscal_result_payload JSONB,
  fiscal_attempts INT NOT NULL DEFAULT 0,
  fiscal_last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  printer_id UUID REFERENCES printers (id) ON DELETE SET NULL,
  status print_job_status NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_jobs_pending ON print_jobs (status, created_at) WHERE status = 'pending';

CREATE TABLE barista_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE barista_user_stores (
  user_id UUID NOT NULL REFERENCES barista_users (id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

-- Следующий public_number для точки и дня (атомарно в транзакции)
-- Логика в приложении: SELECT max(public_number) ... FOR UPDATE или отдельная таблица sequences

CREATE TABLE store_order_sequences (
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  seq_date DATE NOT NULL,
  last_number INT NOT NULL DEFAULT 0 CHECK (last_number >= 0 AND last_number < 10000),
  PRIMARY KEY (store_id, seq_date)
);
