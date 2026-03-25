# Evotor интеграция (фискализация/печать): production requirements

## Контекст потока
Платёж делает Tochka (payment links + webhook). После того как заказ стал `paid`, backend регистрирует фискальный документ в Evotor.

Бизнес-правило продукта:
- в бариста-UI переход `paid -> ready` **разрешён только когда** `payments.fiscal_status = done`
- если Evotor вернул ошибку (`failed`) — выдача блокируется

В БД это отражается полями:
- `payments.fiscal_status = pending | done | failed`
- `fiscal_uuid`, `fiscal_attempts`, `fiscal_last_error`, payloads

## 1) Что нужно настроить/получить в Evotor
1. Access в личный кабинет Evotor
2. Доступ к API и реквизиты:
   - `EVOTOR_FISCALIZATION_URL`
   - `EVOTOR_LOGIN`, `EVOTOR_PASSWORD`
   - `EVOTOR_GROUP_CODE`
3. `cashier_uuid` для MobCashier:
   - в нашем решении предполагается, что он задан глобально (env)
   - переменная: `EVOTOR_CASHIER_UUID`

## 2) Критические правила формирования запроса
Из ТЗ (обязательные поля):
- `tax = NO_VAT`
- `payment_type = TAP_ON_PHONE`

Контакты:
- для `orders/create` отправляем **только `client_email`**
- без `client_phone`
- при валидационных ошибках email — backend должен уметь fallback (в ТЗ уже описан принцип)

Идемпотентность:
- стабильный `receipt_uuid` (рекомендуется `receipt_uuid = order_id`) для исключения дублей
- дедуп/lock на уровне `order_id` и/или `receipt_uuid`

## 3) Как маппить позиции Coffee Stop -> Evotor sell receipt
Идея: каждая строка заказа (`order_lines`) становится одной позицией в Evotor.

Для позиции используем:
- `name`: `menu_item_name_snapshot` (+ текст модификаторов, если есть)
- `quantity`: `order_lines.quantity`
- `price`: `order_lines.unit_price_cents / 100` (цена за единицу; модификаторы уже учтены)
- `settlement_method_type`: `FULL`
- `type`: `NORMAL`
- `tax`: `NO_VAT`

## 4) Какие статусы должна выставлять ваша система после Evotor вызовов
1. Перед попыткой:
   - `payments.fiscal_status = pending`
   - `payments.fiscal_attempts += 1`
2. При успехе:
   - `payments.fiscal_status = done`
   - сохраняем `fiscal_uuid`
   - сохраняем `fiscal_result_payload`
3. При ошибке:
   - `payments.fiscal_status = failed`
   - сохраняем `fiscal_last_error`

## 5) Поведение фронта/баристы (UX)
- `pending`: “Формируем чек...” и кнопки `Готово`/drag&drop в “Готово” отключены
- `failed`: “Чек не сформирован...”, `Готово` отключена
- `done`: `Готово` доступно

## 6) Retry / backoff (production must)
Обязательно:
- ретраи при сетевых ошибках/5xx
- backoff (например 1m → 3m → 10m) до N попыток
- после N ошибок:
  - `fiscal_status = failed`
  - алертинг в логах/метриках (не ломая остальные статусы заказа)

## 7) ИБ (security) — обязательный раздел
- секреты Evotor — только в env/secret manager
- отправка сервер-сервер по HTTPS
- в логах не писать секреты/токены; логировать корреляцию:
  - `order_id`, `receipt_uuid`, `fiscal_status`

## 8) Минимальный тест-план после реализации Evotor
1. Happy path:
   - guest оплатил
   - webhook Tochka `APPROVED` -> order `paid`
   - Evotor зарегистрировал sell receipt -> `fiscal_status=done`
   - бариста может перевести `paid -> ready`
2. Негативные:
   - Evotor временно недоступен -> retry, `ready` остаётся заблокирован
   - ошибка валидации -> `failed`, кнопки отключены
   - повтор callback/повтор Evotor -> нет дублей (receipt_uuid + idempotency)

