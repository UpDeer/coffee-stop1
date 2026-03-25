# Чек-лист внедрения оплаты и фискализации (Точка + готовность к Эвотор)

Этот документ — практический чек-лист для команды: что нужно подготовить и что реализовать, чтобы оплата через **Точка.API платёжные ссылки** работала надёжно, а фискализация была либо через Точку (`With Receipt`), либо (план Б) через **Эвотор «Цифровая касса»**.

## 1) Доступы и настройки у провайдеров

- **Точка Интернет-эквайринг**:\n
  - Подключён в интернет-банке.\n
  - По `Get Retailers` торговая точка в статусе `REG` и `isActive="true"`.\n
  - Подключены нужные `paymentMode` (хотя бы `card` + `sbp`).
- **Фискализация через Точку**:\n
  - Выбран партнёр фискализации при подключении эквайринга.\n
  - Уточнены обязательные поля чека (НДС, paymentMethod/paymentObject, налоговая система).\n
  - Принято решение: **всегда требуем email/phone у гостя**, либо допускаем заказы без контактов (тогда чек некуда отправить).
- **Эвотор “Цифровая касса” (план Б)**:\n
  - Доступ к личному кабинету/токенам.\n
  - Для тестов подтверждён тестовый контур `https://fiscalization-test.evotor.ru` и `group_code`.\n
  - Выбран протокол (ATOL API v4/v5) и согласованы требования к полям чека.

## 2) Секреты и переменные окружения (что хранить)

Минимум для Точки (платёжные ссылки):

- `TOCHKA_CUSTOMER_CODE`\n
- `TOCHKA_MERCHANT_ID` (если несколько торговых точек)\n
- `TOCHKA_PAYMENT_REDIRECT_URL`\n
- `TOCHKA_PAYMENT_FAIL_REDIRECT_URL`\n
- `TOCHKA_WEBHOOK_SECRET_OR_KEYSET` (в зависимости от схемы валидации webhook)\n
- `TOCHKA_API_TOKEN` / JWT (как требует конкретный раздел API)

Для фискализации через Точку (`With Receipt`):

- `TOCHKA_TAX_SYSTEM_CODE`\n
- дефолтные значения `vatType`, `paymentMethod`, `paymentObject` (если не задаются на уровне товара)

Для Эвотор (план Б):

- `EVOTOR_FISCALIZATION_URL`\n
- `EVOTOR_LOGIN`, `EVOTOR_PASSWORD` или токены (как выдаёт сервис)\n
- `EVOTOR_GROUP_CODE`

Правила безопасности:

- секреты только через env/secret manager; не коммитить.\n
- логирование провайдерских payload — с маскированием чувствительных данных.

## 3) Изменения в БД (минимальные поля)

Рекомендуем выделить сущность `payments` (или расширить текущую), чтобы хранить:

- **Привязка к заказу**: `order_id` (FK)\n
- **Провайдер**: `provider = tochka_payment_links`\n
- **Статус**: `payment_status` (`pending/succeeded/failed/refunded`)\n
- **Идентификаторы**:\n
  - `payment_link_id` (то, что мы передаём как `paymentLinkId`)\n
  - `operation_id` (из webhook / списка операций)\n
- **Аудит/диагностика**:\n
  - `provider_payload` (JSON)\n
  - `created_at`, `updated_at`

Для готовности к фискализации через Эвотор:\n
добавить блок `fiscal_*` полей (или отдельную таблицу `fiscal_receipts`):

- `fiscal_provider` (`tochka_partner` / `evotor_digital_cashbox`)\n
- `fiscal_status` (`pending/done/failed`)\n
- `fiscal_uuid`\n
- `receipt_payload` (JSON, который отправили)\n
- `fiscal_result_payload` (JSON результата)\n
- `attempts`, `last_error`

## 4) Реализация checkout (создание платёжной ссылки)

- Сервер рассчитывает `total_cents`.\n
- **Идемпотентность**:\n
  - повторный вызов `checkout` для того же `order_id` возвращает ту же ссылку, пока платёж не завершён/не истёк.\n
- Создаём ссылку через `Create Payment Operation With Receipt`.\n
- Сохраняем `payment_url`/идентификаторы и переводим заказ в `payment_pending`.

## 5) Реализация webhook (подтверждение оплаты)

- **Отдельный эндпоинт**: `POST /api/v1/webhooks/payments/tochka/acquiring-internet-payment`.\n
- **Валидация подлинности**:\n
  - строго по документации для конкретного вида webhook (не смешивать схемы Pay Gateway и платёжных ссылок).\n
- **Дедупликация**:\n
  - ключ дедупа = `operationId`.\n
- При `status=APPROVED`:\n
  - `payment_status=succeeded`\n
  - заказ `payment_pending → paid`\n
  - назначаем `public_number` один раз\n
  - создаём `OrderEvent`.

## 6) Refund (возвраты)

- В админке: кнопка «Возврат».\n
- Сервер находит `operationId` и вызывает refund у Точки.\n
- После подтверждения: `payment_status=refunded`, заказ `refunded/cancelled`, `OrderEvent`.\n
- (Если включён план Б по фискализации) — фискализировать возврат отдельным чеком возврата.

## 7) Тестирование (минимум для релиза)

### Сквозной happy-path

- Создать заказ (`draft`).\n
- `checkout` → получить `payment_url`.\n
- Оплатить по ссылке.\n
- Дождаться webhook `APPROVED`.\n
- Убедиться: заказ `paid`, `public_number` присвоен, заказ виден в бариста-очереди.

### Негативные сценарии

- Повторный `checkout` → та же `payment_url`.\n
- Повторный webhook → нет дублей `public_number`/событий/уведомлений.\n
- Редирект без webhook (гость закрыл вкладку/сеть) → заказ остаётся `payment_pending`.\n
- Refund → корректный переход статусов и аудит.

### Наблюдаемость

- Логи по webhook с correlation: `order_id`, `payment_link_id`, `operation_id`.\n
- Метрики: доля `payment_pending` > N минут, ошибки webhook, ошибки refund.
