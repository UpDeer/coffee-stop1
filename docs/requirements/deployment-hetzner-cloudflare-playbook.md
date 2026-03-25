# Практический playbook: Cloudflare + Hetzner + Docker Compose + Nginx

## Для кого этот документ
Для быстрого production-развёртывания Coffee Stop в интернет:
- 1 VM в Hetzner,
- DNS/прокси через Cloudflare,
- сервисы в Docker Compose,
- HTTPS через Let's Encrypt + Nginx.

---

## 1) Целевая схема
- `guest.<domain>` -> `frontend-guest`
- `barista.<domain>` -> `frontend-barista`
- `api.<domain>` -> `backend` (FastAPI)

Все внешние запросы идут через `nginx` (80/443).
Внутри VM сервисы общаются по приватной docker-сети.

---

## 2) Что подготовить заранее
1. Домен в Cloudflare.
2. VM в Hetzner (Ubuntu 22.04/24.04), минимум:
   - 2 vCPU
   - 4 GB RAM
   - 60+ GB SSD
3. SSH-доступ к VM.
4. Production секреты:
   - Tochka (`TOCHKA_*`)
   - Evotor (`EVOTOR_*`)
   - SMTP provider

---

## 3) DNS в Cloudflare
Создай A-записи на публичный IP VM:
- `guest` -> `<VM_IP>`
- `barista` -> `<VM_IP>`
- `api` -> `<VM_IP>`

Режим Cloudflare:
- стартово можно `DNS only` (серое облако) для простого TLS-старта;
- после стабилизации — включить proxy (оранжевое облако) + WAF/rate limiting.

---

## 4) Подготовка сервера (Ubuntu)
Подключись по SSH и выполни:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg git ufw
```

### Docker + Compose plugin
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

### Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 5) Структура деплоя на сервере
Рекомендуемый путь:
`/opt/coffee-stop`

```bash
sudo mkdir -p /opt/coffee-stop
sudo chown -R $USER:$USER /opt/coffee-stop
cd /opt/coffee-stop
git clone <YOUR_REPO_URL> .
```

---

## 6) Production env-файлы
Создай:
- `/opt/coffee-stop/.env` (backend + общие)
- `/opt/coffee-stop/frontend-guest/.env.local`
- `/opt/coffee-stop/frontend-barista/.env.local`

### backend `.env` (минимум)
```bash
DATABASE_URL=postgresql+psycopg://coffeestop:<DB_PASSWORD>@db:5432/coffeestop
CORS_ORIGINS=https://guest.<domain>,https://barista.<domain>

TOCHKA_API_BASE_URL=https://enter.tochka.com
TOCHKA_API_BEARER_TOKEN=<...>
TOCHKA_CUSTOMER_CODE=<...>
TOCHKA_MERCHANT_ID=<...>
TOCHKA_PAYMENT_REDIRECT_URL=https://guest.<domain>/s/demo/order
TOCHKA_PAYMENT_FAIL_REDIRECT_URL=https://guest.<domain>/s/demo/pay-failed
TOCHKA_PAYMENT_TTL_MINUTES=1440
TOCHKA_PAYMENT_MODES=card,sbp
TOCHKA_WEBHOOK_PUBLIC_JWK_JSON=<json-jwk>

EVOTOR_INTEGRATION_MODE=real
EVOTOR_FISCALIZATION_URL=<...>
EVOTOR_LOGIN=<...>
EVOTOR_PASSWORD=<...>
EVOTOR_GROUP_CODE=<...>
EVOTOR_CASHIER_UUID=<...>
```

### frontend `.env.local`
Для обоих фронтов:
```bash
NEXT_PUBLIC_API_BASE_URL=https://api.<domain>/api/v1
```

---

## 7) Docker Compose (production шаблон)
Создай `docker-compose.prod.yml` в корне:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: coffeestop
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: coffeestop
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks: [internal]

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    depends_on: [db]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    networks: [internal]

  guest:
    build: ./frontend-guest
    restart: unless-stopped
    environment:
      - NEXT_PUBLIC_API_BASE_URL=https://api.${DOMAIN}/api/v1
    command: npm run start -- -p 3000
    networks: [internal]

  barista:
    build: ./frontend-barista
    restart: unless-stopped
    environment:
      - NEXT_PUBLIC_API_BASE_URL=https://api.${DOMAIN}/api/v1
    command: npm run start -- -p 3000
    networks: [internal]

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    depends_on: [backend, guest, barista]
    volumes:
      - ./deploy/nginx/conf.d:/etc/nginx/conf.d:ro
      - ./deploy/certbot/www:/var/www/certbot
      - ./deploy/certbot/conf:/etc/letsencrypt
    ports:
      - "80:80"
      - "443:443"
    networks: [internal]

  certbot:
    image: certbot/certbot:latest
    volumes:
      - ./deploy/certbot/www:/var/www/certbot
      - ./deploy/certbot/conf:/etc/letsencrypt
    networks: [internal]

volumes:
  pg_data:

networks:
  internal:
```

> Примечание: для production лучше вынести БД в managed PostgreSQL.

---

## 8) Nginx конфиги (3 хоста)
Создай `deploy/nginx/conf.d/coffee-stop.conf`:

```nginx
server {
  listen 80;
  server_name guest.<domain> barista.<domain> api.<domain>;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl http2;
  server_name guest.<domain>;
  ssl_certificate /etc/letsencrypt/live/guest.<domain>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/guest.<domain>/privkey.pem;
  location / { proxy_pass http://guest:3000; include /etc/nginx/proxy_params; }
}

server {
  listen 443 ssl http2;
  server_name barista.<domain>;
  ssl_certificate /etc/letsencrypt/live/barista.<domain>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/barista.<domain>/privkey.pem;
  location / { proxy_pass http://barista:3000; include /etc/nginx/proxy_params; }
}

server {
  listen 443 ssl http2;
  server_name api.<domain>;
  ssl_certificate /etc/letsencrypt/live/api.<domain>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.<domain>/privkey.pem;
  client_max_body_size 2m;
  location / { proxy_pass http://backend:8000; include /etc/nginx/proxy_params; }
}
```

---

## 9) Первый выпуск сертификатов Let's Encrypt
1. Старт nginx на 80:
```bash
docker compose -f docker-compose.prod.yml up -d nginx
```
2. Выпуск cert по каждому домену:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d guest.<domain> -d barista.<domain> -d api.<domain> \
  --email <YOUR_EMAIL> --agree-tos --no-eff-email
```
3. Перезапуск nginx:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

---

## 10) Полный запуск
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Проверки:
```bash
curl -I https://api.<domain>/api/v1/health
curl -I https://guest.<domain>
curl -I https://barista.<domain>
```

---

## 11) Миграции БД перед go-live
Для существующей базы выполнить:
- `backend/migrations/001_menu_items_stock_qty.sql`
- `backend/migrations/002_payments_evotor_fiscal_fields.sql`

Если БД новая — инициализация через `backend/schema.sql`.

---

## 12) Стабилизация после запуска
1. Включить Cloudflare proxy + WAF rules.
2. Добавить rate limiting на webhook path и публичные API.
3. Настроить бэкапы БД и проверку восстановления.
4. Включить мониторинг:
   - latency/error rates
   - webhook failures
   - `fiscal_status=failed` count

---

## 13) Операционные команды
### Обновление
```bash
cd /opt/coffee-stop
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Логи
```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Остановка/старт
```bash
docker compose -f docker-compose.prod.yml stop
docker compose -f docker-compose.prod.yml start
```

---

## 14) Риски и узкие места (честно)
- Один VM = single point of failure.
- Self-hosted Postgres на той же VM = риск потери данных при аварии сервера.
- Для роста лучше перейти на:
  - managed DB,
  - отдельные staging/prod окружения,
  - blue/green или rolling deploy.

