# Этап 1: API v1 (контракты)

Базовый URL: `/api/v1`. Формат JSON. Ошибки: `{ "error": { "code": "...", "message": "..." } }`.

---

## Публичное API (гость, без пароля бариста)

### Меню точки

`GET /public/stores/{slug}/menu`

Ответ: дерево категорий → позиции (id, name, description, image_url, price_cents, modifier_groups[]).

### Создать черновик заказа

`POST /public/stores/{slug}/orders`

Тело: строки `{ menu_item_id, quantity, modifier_option_ids[] }`, опционально `guest_email`.

Ответ: `{ order_id, status: "draft", lines[], total_cents }`.

Проверка: `?t=` в Referer или в теле `qr_token` (если QR подписан).

### Рассчитать сумму (опционально)

`PATCH /public/orders/{order_id}` — обновить строки до оплаты.

### Создать платёж (Tochka payment links)

`POST /public/orders/{order_id}/checkout/tochka`

Идемпотентность: заголовок `Idempotency-Key: <uuid>` или один ключ на order_id.

Ответ: `{ payment_url }` или `{ client_secret для виджета }`, `status: "payment_pending"`.

Уточнение для выбранного провайдера (Точка → платёжные ссылки):

- В ответе возвращаем `{ payment_url }` (страница оплаты у банка).
- Редирект гостя после оплаты **не** подтверждает платёж: заказ становится `paid` только по webhook/подтверждённому статусу операции.

### Статус заказа (гость)

`GET /public/orders/{order_id}/status` — публичный токен в query `?token=<jwt>` или секрет из email-ссылки, чтобы не светить чужие заказы.

Ответ: `{ status, public_number | null, ready_at | null }`.

### Webhook оплаты (Tochka)

`POST /webhooks/tochka/acquiring-internet-payment` — только сервер провайдера; подпись JWT (RS256) проверяется; при успехе → `paid`, выдача `public_number`.

Точка (платёжные ссылки, событие `acquiringInternetPayment`):

- `POST /webhooks/tochka/acquiring-internet-payment`
- Успешная оплата: `status=APPROVED` → перевод `payment_pending → paid` и выдача `public_number`.
- Обработчик должен быть **идемпотентным** (повторы webhook допустимы).

---

## API баристы (Bearer JWT или session)

### Очередь

`GET /barista/stores/{store_id}/orders?status=paid|ready`

Ответ: список заказов с полным составом (строки + модификаторы), `public_number`, время, сумма.

### Готово

`POST /barista/orders/{order_id}/ready`

Тело пустое. Эффект: `paid` → `ready`, создание `PrintJob`, уведомление гостю (этап 5.1), событие в `OrderEvent`.

Бизнес-правило: переход разрешён только если `payments.fiscal_status = done`.

Ошибка `409`:
- `invalid_status` (если заказ не в `paid`)
- `fiscalization_not_done` (если `fiscal_status = pending`)
- `fiscalization_failed` (если `fiscal_status = failed`)

### Отмена / возврат

`POST /barista/orders/{order_id}/cancel` — до `ready`, с возвратом если было `paid`.

`POST /barista/orders/{order_id}/refund` — после оплаты.

### Повторная печать

`POST /barista/orders/{order_id}/reprint` — новый `PrintJob` для заказа в `ready`.

### Print-agent (polling)

`GET /agents/print-jobs?printer_key=...&since=...` — задания в статусе `pending`.

`POST /agents/print-jobs/{id}/complete` — `done` или `failed` + сообщение.

---

## Коды ошибок (пример)

| code | HTTP |
|------|------|
| store_not_found | 404 |
| store_closed | 403 |
| order_not_found | 404 |
| invalid_status | 409 |
| fiscalization_not_done | 409 |
| fiscalization_failed | 409 |
| payment_failed | 400 + reason в message |

---

Дальше: реализация бэкенда по [../../backend/README.md](../../backend/README.md).
