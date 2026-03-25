# Backend

Цель — **полноценный рабочий сервис** (не MVP): см. [../docs/requirements/stack.md](../docs/requirements/stack.md).

Стек: **FastAPI**, PostgreSQL, SQLAlchemy. Доставка заданий на печать — **polling** (print-agent).

## Что уже есть

- **[schema.sql](schema.sql)** — DDL PostgreSQL: точки, меню, заказы, платежи, печать, бариста.
- **[../docs/requirements/domain-model.md](../docs/requirements/domain-model.md)** — описание сущностей и переходов статусов.
- **[../docs/requirements/api-v1.md](../docs/requirements/api-v1.md)** — эндпоинты публичного и бариста API, агент печати.

## База через Docker Desktop

В корне репозитория есть **[docker-compose.yml](../docker-compose.yml)**.

1. Запусти **Docker Desktop** (`/Applications/Docker.app`).
2. В терминале из корня проекта:

   ```bash
   docker compose up -d
   ```

Также поднимется **MailHog** (SMTP песочница) для локальной проверки писем:

- Web UI: `http://127.0.0.1:8025`
- SMTP: `127.0.0.1:1025`

3. Подключение:
   - **Host:** `localhost`
   - **Port:** `5432`
   - **Database:** `coffeestop`
   - **User / password:** `coffeestop` / `coffeestop`

При **первом** запуске контейнера PostgreSQL сам выполнит `backend/schema.sql` из `/docker-entrypoint-initdb.d/`.

Если том уже создан без схемы или нужно пересоздать БД с нуля:

```bash
docker compose down -v   # удалит данные в volume
docker compose up -d
```

Или вручную: `psql postgresql://coffeestop:coffeestop@localhost:5432/coffeestop -f backend/schema.sql`

**Уже поднятая БД без новых колонок:** при появлении файлов в `backend/migrations/` выполни их по порядку, например:

```bash
psql postgresql://coffeestop:coffeestop@localhost:5432/coffeestop -f backend/migrations/001_menu_items_stock_qty.sql
```

Строка подключения для приложения: см. [.env.example](../.env.example) (для SQLAlchemy нужен драйвер `postgresql+psycopg://...`).

## Запуск API (локально)

Нужен **Python 3.11+** (в `pyproject.toml` так указано). Если по умолчанию стоит 3.8, поставь через Homebrew: `brew install python@3.11` и создавай venv так: `python3.11 -m venv .venv`.

Из каталога `backend/`:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt
# Скопируй .env в backend/ (или задай переменные в shell):
cp ../.env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Документация: http://127.0.0.1:8000/docs  
- `GET /api/v1/health` — liveness  
- `GET /api/v1/ready` — readiness (проверка БД)

## Следующие шаги

1. Модели SQLAlchemy + Alembic (миграции вместо ручного правления `schema.sql` при изменениях).
2. Реализация эндпоинтов по [../docs/requirements/api-v1.md](../docs/requirements/api-v1.md).
3. Сиды: точка, меню, пользователь бариста.

## Выделение `public_number` при оплате

В одной транзакции с подтверждением webhook:

1. `INSERT INTO store_order_sequences ... ON CONFLICT DO UPDATE SET last_number = store_order_sequences.last_number + 1 RETURNING last_number` (или `SELECT ... FOR UPDATE` на строку даты).
2. Ограничить 1–999 в день; при необходимости расширить правило в коде.
3. Обновить `orders`: `status = paid`, `public_number`, `public_number_date`.

## QR-токен для точки

Параметр `?t=` — подпись HMAC(slug + expiry) или JWT с `store_id`/`slug`, проверка на `GET menu` и `POST orders`.
