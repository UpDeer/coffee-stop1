# Практический playbook: развертывание в Yandex Cloud (без Hetzner/Cloudflare)

## Цель
Разместить Coffee Stop в интернете через внутренние сервисы Yandex Cloud:
- HTTPS для guest/barista/api,
- доступность webhook для Tochka/Evotor,
- безопасный и управляемый production-контур.

---

## 1) Целевая архитектура в Yandex Cloud
- `guest.<domain>` -> Guest UI (Next.js)
- `barista.<domain>` -> Barista UI (Next.js)
- `api.<domain>` -> Backend (FastAPI)
- PostgreSQL -> Yandex Managed Service for PostgreSQL

Рекомендуемый минимальный контур:
1. **VPC + подсети**
2. **Compute Cloud VM** (или 2 VM: app + ops)
3. **Managed PostgreSQL**
4. **Container Registry** (образы)
5. **Application Load Balancer** или Nginx на VM
6. **Certificate Manager** (TLS)
7. **Cloud DNS** (если домен в Yandex)
8. **Lockbox** для секретов (рекомендуется)
9. **Cloud Logging + Monitoring + Alerting**

---

## 2) Два рабочих варианта
## Вариант A (проще и быстрее)
- 1 VM + Docker Compose + Nginx
- Managed PostgreSQL отдельно
- TLS через Let's Encrypt на VM

Плюсы: быстро стартовать  
Минусы: single point of failure

## Вариант B (более production)
- Managed Instance Group (или 2 VM за балансировщиком)
- L7 Load Balancer + Certificate Manager
- Backend/UI как контейнеры
- Managed PostgreSQL

Плюсы: отказоустойчивость, централизованный TLS  
Минусы: выше сложность и стоимость

---

## 3) Минимальный план (рекомендуемый старт: Вариант A)
### Шаг 1. Сеть и БД
1. Создать VPC и подсети.
2. Поднять Managed PostgreSQL:
   - private доступ из VPC
   - user/db для `coffeestop`
   - включить ежедневные бэкапы.

### Шаг 2. VM для приложений
1. Поднять Ubuntu VM (2 vCPU/4GB RAM минимум).
2. Открыть в Security Group:
   - `22` (SSH, по IP allowlist),
   - `80` и `443` (внешний HTTP/HTTPS).
3. Установить Docker + Compose plugin.

### Шаг 3. Домен и DNS
1. Настроить A-записи на внешний IP VM:
   - `guest.<domain>`
   - `barista.<domain>`
   - `api.<domain>`
2. Проверить резолв DNS.

### Шаг 4. Деплой приложений
1. Собирать и пушить образы в Yandex Container Registry.
2. На VM:
   - положить `docker-compose.prod.yml`,
   - положить `.env.prod`,
   - запустить `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`.

### Шаг 5. HTTPS
1. Выпустить сертификаты (Let's Encrypt на VM или Certificate Manager + LB).
2. Включить redirect `http -> https`.
3. Проверить:
   - `https://guest.<domain>`
   - `https://barista.<domain>`
   - `https://api.<domain>/api/v1/health`

### Шаг 6. Webhooks
Проверить, что публично доступен:
- `https://api.<domain>/api/v1/webhooks/tochka/acquiring-internet-payment`

---

## 4) Env и секреты (что обязательно заполнить)
Используй `.env.prod` (на основе `.env.prod.example`):

- БД:
  - `DATABASE_URL` (host Managed PostgreSQL)
- CORS:
  - `CORS_ORIGINS=https://guest.<domain>,https://barista.<domain>`
- Tochka:
  - `TOCHKA_API_BEARER_TOKEN`
  - `TOCHKA_CUSTOMER_CODE`
  - `TOCHKA_MERCHANT_ID` (если нужен)
  - `TOCHKA_PAYMENT_REDIRECT_URL`
  - `TOCHKA_PAYMENT_FAIL_REDIRECT_URL`
  - `TOCHKA_WEBHOOK_PUBLIC_JWK_JSON`
- Evotor:
  - `EVOTOR_INTEGRATION_MODE=real`
  - `EVOTOR_FISCALIZATION_URL`
  - `EVOTOR_LOGIN`, `EVOTOR_PASSWORD`
  - `EVOTOR_GROUP_CODE`
  - `EVOTOR_CASHIER_UUID`

Рекомендация: хранить секреты в **Lockbox**, а в VM подставлять через CI/CD или startup-скрипт.

---

## 5) CI/CD в Yandex Cloud (практично)
Минимум:
1. Push в main ->
   - lint/build/test,
   - сборка 3 образов (backend, guest, barista),
   - push в Container Registry.
2. Deploy job ->
   - SSH на VM,
   - `docker compose pull`,
   - `docker compose up -d`.

Опционально:
- blue/green на двух VM за балансировщиком.

---

## 6) Наблюдаемость и эксплуатация
Обязательно:
- логи backend/nginx в Cloud Logging
- алерты:
  - недоступность `/health` и `/ready`,
  - рост `5xx`,
  - рост `fiscal_status=failed`,
  - webhook ошибки по Tochka.

Рекомендуемые метрики:
- webhook success/fail ratio,
- payment_pending age,
- paid->ready latency,
- Evotor retry count.

---

## 7) ИБ требования (для production)
1. DB не выставлять наружу.
2. SSH только по allowlist IP.
3. CORS только на guest/barista домены.
4. Не хранить секреты в репозитории.
5. Проверка JWT подписи webhook Tochka обязательна.
6. Идемпотентность webhook по `operationId`.
7. Регулярно обновлять ОС и образы.

---

## 8) Что делать прямо сейчас (чеклист запуска)
1. Выбрать вариант A или B.
2. Поднять Managed PostgreSQL в Yandex Cloud.
3. Поднять VM и задеплоить текущий `docker-compose.prod.yml`.
4. Настроить DNS и HTTPS.
5. Прописать реальные `TOCHKA_*` и `EVOTOR_*`.
6. Пройти e2e проверку:
   - guest order -> checkout Tochka -> webhook APPROVED -> paid
   - Evotor fiscalization -> `fiscal_status=done`
   - barista: `paid -> ready` разрешается только при `done`.

---

## 9) Важное замечание по рискам
Если бюджет ограничен, стартуй с **Варианта A** (одна VM + managed DB), но:
- сразу включи backup/monitoring,
- держи план миграции на HA-схему (Вариант B), когда пойдет реальный трафик.

