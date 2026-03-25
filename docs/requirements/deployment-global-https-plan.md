# План размещения Coffee Stop в глобальной сети (HTTPS, production)

## Цель
Развернуть сервис в интернете так, чтобы:
- guest и barista UI были доступны по HTTPS;
- backend API принимал внешние webhooks (Tochka/Evotor);
- была безопасная, наблюдаемая и повторяемая схема релиза.

## 1) Целевая схема (production)
- `guest.<your-domain>` -> Next.js Guest UI
- `barista.<your-domain>` -> Next.js Barista UI
- `api.<your-domain>` -> FastAPI backend (`/api/v1/...`)
- PostgreSQL как отдельный managed сервис (не в публичной сети)

Рекомендация:
- один облачный провайдер (например Hetzner/AWS/GCP/DO),
- reverse proxy/ingress с TLS (Nginx/Traefik/Cloudflare + origin cert),
- private network между API и DB.

## 2) Домены и DNS
1. Купить/использовать домен.
2. Создать DNS-записи:
   - `guest` -> frontend guest
   - `barista` -> frontend barista
   - `api` -> backend
3. Включить proxy/WAF (опционально, но желательно).

## 3) HTTPS (обязательно)
1. Выпустить TLS-сертификаты (Let's Encrypt или managed cert).
2. Включить авто-обновление сертификатов.
3. Включить принудительный HTTPS redirect.
4. Убедиться, что webhook endpoint доступен снаружи:
   - `https://api.<your-domain>/api/v1/webhooks/tochka/acquiring-internet-payment`

## 4) Production окружение (env/секреты)
Хранить секреты только в secret manager/CI secrets (не в репозитории):

- Backend:
  - `DATABASE_URL`
  - `CORS_ORIGINS` (строгий список доменов, без `*`)
  - `TOCHKA_API_BEARER_TOKEN`
  - `TOCHKA_CUSTOMER_CODE`
  - `TOCHKA_MERCHANT_ID` (если нужен)
  - `TOCHKA_PAYMENT_REDIRECT_URL`
  - `TOCHKA_PAYMENT_FAIL_REDIRECT_URL`
  - `TOCHKA_WEBHOOK_PUBLIC_JWK_JSON`
  - `EVOTOR_FISCALIZATION_URL`
  - `EVOTOR_LOGIN`
  - `EVOTOR_PASSWORD`
  - `EVOTOR_GROUP_CODE`
  - `EVOTOR_CASHIER_UUID`
- Frontends:
  - `NEXT_PUBLIC_API_BASE_URL=https://api.<your-domain>/api/v1`

## 5) База данных и миграции
1. Поднять production PostgreSQL (managed preferred).
2. Ограничить доступ к DB только из backend сети.
3. Применить схему/миграции:
   - `backend/schema.sql` (для новой БД)
   - все SQL в `backend/migrations/` по порядку (для обновлений)
4. Включить backup policy:
   - ежедневный full backup,
   - retention 7/14/30 дней,
   - тест восстановления минимум раз в месяц.

## 6) Развёртывание приложений
### Вариант A (рекомендуется): Docker + reverse proxy
- backend контейнер,
- guest frontend контейнер,
- barista frontend контейнер,
- Nginx/Traefik как внешний entrypoint.

### Вариант B: PaaS
- frontends на Vercel/Netlify,
- backend на Render/Fly/railway/VM.

Важно:
- у backenda должен быть стабильный публичный HTTPS URL для webhook.

## 7) CI/CD (минимум)
1. Git push в main -> pipeline:
   - install dependencies,
   - lint/typecheck/build,
   - backend smoke tests.
2. Deploy:
   - staging (авто),
   - production (manual approve).
3. После deploy:
   - smoke check `GET /api/v1/health`,
   - smoke check `GET /api/v1/ready`,
   - проверка guest/barista страниц.

## 8) Безопасность и ИБ
1. CORS без wildcard в production.
2. Rate limiting на публичные endpoints и webhooks.
3. Логирование без секретов и PII.
4. Валидация webhook подписи (Tochka JWT RS256).
5. Идемпотентность webhook (дедуп по `operationId`).
6. Минимум прав сервисным аккаунтам (least privilege).
7. WAF/Firewall правила:
   - открыть только нужные порты,
   - DB не публиковать наружу.

## 9) Наблюдаемость
1. Централизованные логи (backend + reverse proxy).
2. Метрики:
   - latency/error rate,
   - webhook success/fail,
   - доля заказов с `fiscal_status=failed`.
3. Алерты:
   - webhook 4xx/5xx spikes,
   - рост `payment_pending`/`fiscal_failed`,
   - недоступность `health/ready`.

## 10) Проверка боевого контура (Go-Live checklist)
1. Открывается:
   - `https://guest.<domain>/s/demo`
   - `https://barista.<domain>`
   - `https://api.<domain>/api/v1/health`
2. Тест оплаты:
   - заказ -> checkout Tochka -> webhook APPROVED -> `paid`
3. Тест фискализации:
   - `paid` -> Evotor -> `fiscal_status=done`
4. Проверка бизнес-правила:
   - `paid -> ready` запрещён при `pending/failed`,
   - разрешён только при `done`.
5. Тест негативов:
   - повтор webhook,
   - недоступность Evotor,
   - rollback релиза.

## 11) План этапов внедрения
### Этап 1: Staging (1-2 дня)
- Поднять staging домены и HTTPS.
- Развернуть backend+frontends.
- Проверить end-to-end с тестовыми данными.

### Этап 2: Production soft launch (1 день)
- Ограниченный трафик (1 точка/небольшой поток).
- Мониторинг метрик и логов в реальном времени.

### Этап 3: Полный production
- Включить все точки.
- Финализировать операционные регламенты (инциденты, возвраты, фискализация).

## 12) Что подготовить заранее (владельцу продукта)
- Домен и доступ к DNS.
- Доступы к облаку/серверу.
- Токены/доступы Tochka.
- Доступы Evotor API.
- Решение по провайдеру email (production SMTP/transactional email).
- Ответственный за on-call в первые дни запуска.

