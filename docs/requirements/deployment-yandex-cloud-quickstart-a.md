# Yandex Cloud Quickstart (Вариант A за 1 вечер)

## Что получите в конце
- VM в Yandex Cloud с Docker/Compose
- Managed PostgreSQL
- Доступ по HTTPS к:
  - `guest.<domain>`
  - `barista.<domain>`
  - `api.<domain>`
- Готовность принимать webhook от Tochka

> Этот гайд рассчитан на быстрый запуск. Потом можно перейти на HA-схему.

---

## 0) Предварительные условия
1. Установлен `yc` CLI и выполнен `yc init`
2. Есть домен и доступ к DNS
3. В проекте уже есть:
   - `docker-compose.prod.yml`
   - `.env.prod.example`
   - `deploy/nginx/conf.d/coffee-stop.conf`

---

## 1) Переменные (подставьте свои)
```bash
export YC_FOLDER_ID="<your-folder-id>"
export YC_ZONE="ru-central1-a"
export YC_NETWORK_NAME="coffee-stop-net"
export YC_SUBNET_NAME="coffee-stop-subnet-a"
export YC_SG_NAME="coffee-stop-sg"
export YC_VM_NAME="coffee-stop-prod-vm"
export YC_VM_CORES="2"
export YC_VM_MEMORY="4"
export YC_VM_DISK_GB="60"
export YC_PG_CLUSTER_NAME="coffee-stop-pg"
export YC_PG_DB_NAME="coffeestop"
export YC_PG_USER="coffeestop"
export YC_PG_PASSWORD="<strong-password>"
export SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"
```

Проверь активную папку:
```bash
yc config set folder-id "$YC_FOLDER_ID"
yc config get folder-id
```

---

## 2) Сеть и подсеть
```bash
yc vpc network create --name "$YC_NETWORK_NAME"
yc vpc subnet create \
  --name "$YC_SUBNET_NAME" \
  --zone "$YC_ZONE" \
  --range 10.10.0.0/24 \
  --network-name "$YC_NETWORK_NAME"
```

---

## 3) Security Group (SSH/HTTP/HTTPS)
```bash
yc vpc security-group create \
  --name "$YC_SG_NAME" \
  --network-name "$YC_NETWORK_NAME" \
  --rule "direction=ingress,protocol=tcp,port=22,v4-cidrs=[0.0.0.0/0],description=ssh" \
  --rule "direction=ingress,protocol=tcp,port=80,v4-cidrs=[0.0.0.0/0],description=http" \
  --rule "direction=ingress,protocol=tcp,port=443,v4-cidrs=[0.0.0.0/0],description=https" \
  --rule "direction=egress,protocol=any,v4-cidrs=[0.0.0.0/0],description=all-egress"
```

> Для production лучше ограничить SSH по вашему офисному IP.

---

## 4) Managed PostgreSQL
Создание кластера:
```bash
yc managed-postgresql cluster create "$YC_PG_CLUSTER_NAME" \
  --environment production \
  --network-name "$YC_NETWORK_NAME" \
  --host zone-id="$YC_ZONE",subnet-name="$YC_SUBNET_NAME",assign-public-ip=false \
  --resource-preset s2.micro \
  --disk-size 20 \
  --disk-type network-ssd
```

Создание БД и пользователя:
```bash
yc managed-postgresql database create \
  --cluster-name "$YC_PG_CLUSTER_NAME" \
  --name "$YC_PG_DB_NAME"

yc managed-postgresql user create \
  --cluster-name "$YC_PG_CLUSTER_NAME" \
  --name "$YC_PG_USER" \
  --password "$YC_PG_PASSWORD"
```

Выдать права:
```bash
yc managed-postgresql user grant-permission \
  --cluster-name "$YC_PG_CLUSTER_NAME" \
  --name "$YC_PG_USER" \
  --permission database-name="$YC_PG_DB_NAME"
```

Получить FQDN хоста БД:
```bash
yc managed-postgresql host list --cluster-name "$YC_PG_CLUSTER_NAME"
```

Скопируйте `fqdn` в `DATABASE_URL`:
`postgresql+psycopg://coffeestop:<pass>@<fqdn>:6432/coffeestop`

---

## 5) Cloud-init для VM (Docker + Compose)
Используйте готовый шаблон:
- `deploy/yc/cloud-init.yaml`

---

## 6) VM в Compute Cloud
```bash
yc compute instance create \
  --name "$YC_VM_NAME" \
  --zone "$YC_ZONE" \
  --platform standard-v3 \
  --cores "$YC_VM_CORES" \
  --memory "$YC_VM_MEMORY" \
  --create-boot-disk image-family=ubuntu-2204-lts,size="$YC_VM_DISK_GB",type=network-ssd \
  --network-interface subnet-name="$YC_SUBNET_NAME",nat-ip-version=ipv4,security-group-ids="$(yc vpc security-group get "$YC_SG_NAME" --format json | jq -r '.id')" \
  --metadata-from-file user-data=cloud-init.yaml \
  --ssh-key "$SSH_KEY_PATH"
```

Получить внешний IP:
```bash
yc compute instance get "$YC_VM_NAME" --format json | jq -r '.network_interfaces[0].primary_v4_address.one_to_one_nat.address'
```

---

## 7) DNS записи
Создайте A-записи на IP VM:
- `guest.<domain>`
- `barista.<domain>`
- `api.<domain>`

Дождитесь распространения DNS.

---

## 8) Деплой приложения на VM
SSH на VM:
```bash
ssh ubuntu@<VM_IP>
```

На VM:
```bash
mkdir -p /opt/coffee-stop
cd /opt/coffee-stop
git clone <YOUR_REPO_URL> .
cp .env.prod.example .env.prod
```

Заполнить `.env.prod`:
- `DOMAIN=...`
- `DATABASE_URL=...` (Managed PostgreSQL fqdn)
- `TOCHKA_*`
- `EVOTOR_*`
- image-теги `COFFEE_STOP_*_IMAGE`

Запуск:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

---

## 9) Выпуск TLS (Let's Encrypt)
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d nginx

docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d guest.<domain> -d barista.<domain> -d api.<domain> \
  --email <your-email> --agree-tos --no-eff-email

docker compose --env-file .env.prod -f docker-compose.prod.yml restart nginx
```

Проверки:
```bash
curl -I https://api.<domain>/api/v1/health
curl -I https://guest.<domain>
curl -I https://barista.<domain>
```

---

## 10) Применение миграций БД
Для существующей БД (однократно):
- `backend/migrations/001_menu_items_stock_qty.sql`
- `backend/migrations/002_payments_evotor_fiscal_fields.sql`

Если база новая — можно инициализировать `backend/schema.sql`.

---

## 11) Go-live тест (обязательный)
1. Guest: создать заказ
2. Checkout через Tochka
3. Убедиться, что webhook дошел и заказ стал `paid`
4. Убедиться, что `fiscal_status` меняется по Evotor
5. Проверить правило:
   - `paid -> ready` блокируется при `pending/failed`
   - разрешено только при `done`

---

## 12) Полезные команды эксплуатации
Логи:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f nginx
```

Обновление релиза:
```bash
cd /opt/coffee-stop
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Остановка:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml stop
```

---

## Бонус: полуавтоматический bootstrap
В репозитории есть скрипт:
- `deploy/yc/yc-quickstart.sh`

Он создаёт:
- VPC/subnet/security-group
- Managed PostgreSQL (cluster/db/user)
- VM с `cloud-init`

Запуск:
```bash
chmod +x deploy/yc/yc-quickstart.sh
FOLDER_ID=<your-folder-id> PG_PASSWORD='<strong-password>' ./deploy/yc/yc-quickstart.sh
```

