# Runbook: как запускать сервис локально (dev)

## Что должно быть запущено
1. PostgreSQL (схема `backend/schema.sql`)
2. Backend `coffee-stop-api` (FastAPI) на `/api/v1`
3. Guest UI `frontend-guest` (Next.js PWA) — страница меню/корзина/оплата
4. Barista UI `frontend-barista` (Next.js) — очередь заказов и редактор меню
5. (Опционально для email) `MailHog` на случай тестовых писем

## Порты (по умолчанию)
- Backend: `127.0.0.1:8000`
- Guest UI: `localhost:3000`
- Barista UI: `localhost:3000` *или* другой порт (см. ниже)
- PostgreSQL: `localhost:5432`
- MailHog UI: `http://127.0.0.1:8025` (SMTP `127.0.0.1:1025`)

## 1) Подними БД и MailHog через Docker Desktop
Из корня проекта `coffee_stop_soft`:
```bash
docker compose up -d
```

Проверки:
- БД должна отвечать на `localhost:5432`
- MailHog должен быть доступен на `http://127.0.0.1:8025`

## 2) Подними backend (FastAPI)
В отдельном терминале:
```bash
cd "/Users/georgekhokhlov/Cursor_project/coffee_stop_soft/backend"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Быстрая проверка после старта:
```bash
curl -s http://127.0.0.1:8000/api/v1/health
```

## 3) Подними Guest UI
В отдельном терминале:
```bash
cd "/Users/georgekhokhlov/Cursor_project/coffee_stop_soft/frontend-guest"
cp .env.local.example .env.local 2>/dev/null || true
# если файла .env.local.example нет — создай frontend-guest/.env.local вручную:
# NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
npm install
npm run dev
```

Открывай в браузере:
- `http://localhost:3000/s/demo`

## 4) Подними Barista UI
Важно: у Guest UI уже порт `3000`, поэтому Barista обычно запускают на другом порту.
Пример:
```bash
cd "/Users/georgekhokhlov/Cursor_project/coffee_stop_soft/frontend-barista"
npm install
PORT=3003 npm run dev
```

Открывай:
- `http://localhost:3003`

## “Оставить работающим”
- БД/почта уже подняты через `docker compose up -d` и не требуют терминала.
- Backend и frontends нужно держать в активных терминалах (открой 2-3 терминала и не закрывай вкладки).
- Если хочешь “оставлять без терминала” — используй `tmux`/`screen` (опционально, не обязательно).

## Что смотреть, если не работает
1. Backend не отвечает: проверить `/api/v1/health` и корректность `DATABASE_URL`
2. Frontend не отвечает: проверить `NEXT_PUBLIC_API_BASE_URL`
3. Barista/Guest не различаются по портам: убедиться, что Barista запущен не на том же порту, что Guest

