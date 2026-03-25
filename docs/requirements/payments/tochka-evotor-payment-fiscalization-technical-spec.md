# Техническое задание: Tochka API → `paid` → фискализация в Evotor → печать чека

## Статус
Этот документ описывает “готовый продукт” (не MVP): что делать в коде, какие эндпоинты/таблицы нужны, и какие требования ИБ должны быть соблюдены.

## 1. Предпосылки / допущения
1) GUEST не запускает приложения.
2) Оплата делается через Tochka payment links (internet acquiring).
3) Фискальный чек печатается через Evotor (digital cashbox, ATOL-compatible).
4) После webhook Tochka `APPROVED` заказ переводится в `paid` и начинается фискализация.

## 2. Изменения в БД
Текущая схема: `payments` уже привязана к `order_id`, хранит `provider`, `provider_payment_id`, `status`, `raw_payload`.

Нужно добавить в `payments` (или в отдельную таблицу `fiscal_receipts`) параметры для Evotor:
- `fiscal_status`: `pending | done | failed`
- `fiscal_provider`: например `evotor_digital_cashbox`
- `fiscal_uuid`: идентификатор чека/документа Evotor (что вернёт API)
- `fiscal_payload`: JSON, который отправили в Evotor
- `fiscal_result_payload`: JSON ответа Evotor
- `fiscal_attempts`, `fiscal_last_error`

Также требуется однозначная привязка Tochka операции:
- в `payments.provider_payment_id` хранить `operationId` из webhook `acquiringInternetPayment`

Рекомендация по уникальности/идемпотентности:
- уникальный ключ/индекс по `(order_id, provider_payment_id, fiscal_provider)` либо (достаточно) по `order_id` + тип чека “sell”.

## 3. Эндпоинты backend

### 3.1 Checkout Tochka
Заменить текущий mock-checkout для production на отдельный endpoint:
- `POST /public/orders/{order_id}/checkout/tochka`

Логика:
1) Проверить `orders.status == draft`
2) Вычислить `total_cents` на сервере (не доверять фронту)
3) Создать payment link через Tochka `Create Payment Operation`
   - режим “без фискализации чеков” (чтобы фискализация была в Evotor)
4) Сохранить:
   - `payments.provider = 'tochka_payment_links'`
   - `payments.provider_payment_id = operationId` (из ответа Tochka)
   - `payments.status = 'pending'`
5) Обновить `orders.status = payment_pending`
6) Ответить фронту:
   - `payment_url` (ссылка на оплату)

### 3.2 Webhook Tochka
Добавить endpoint:
- `POST /api/v1/webhooks/tochka/acquiring-internet-payment`

Логика:
1) Проверить подлинность webhook: тело = JWT, подпись RS256, проверять по публичному ключу Tochka
2) Валидировать `webhookType == acquiringInternetPayment`
3) Достать:
   - `status` (AUTHORIZED / APPROVED)
   - `operationId` (operationId)
   - `customerCode/paymentLinkId` (если используете)
4) Идемпотентность:
   - если operationId уже обработан — ничего не делать
5) При `status == APPROVED`:
   - перевести `orders.payment_pending -> paid`
   - присвоить `public_number` (как уже делается в `_mark_paid_and_assign_number`)
   - обновить `payments.status = succeeded`
   - инициировать фискализацию в Evotor (в фоне)

### 3.3 Фоновые задачи: фискализация Evotor
Нужна фоновая задача/воркер:
- старт при переходе заказа в `paid`
- ретраи с backoff при 5xx/сетевых ошибках

Подход по архитектуре:
1) Сразу после `paid` ставим `payments.fiscal_status = pending`
2) Отдельная worker-функция вызывает Evotor digital cashbox и регистрирует sell receipt
3) По завершению обновляет `fiscal_status = done/failed` и хранит `fiscal_uuid`/payloadы

## 4. Формирование данных для Evotor sell receipt

Минимально нужен:
- `order_id` (как идентификатор)
- позиции: `name`, `quantity`, `price/amount`
- сумма
- налоговая система (`taxSystemCode` либо аналог в протоколе)
- контакты: email (так как ранее задано email-only)
- сведения о способе расчёта (full/prepayment — по правилам вашего сценария)
- group_code / организационные поля (в терминах Evotor/ATOL)

Важно:
- В отличие от “модели MobCashier” тут мы делаем фискализацию после подтверждения оплаты.
- Поэтому `positions` берём из уже рассчитанных `order_lines + modifiers`, как есть в заказе.

## 5. Печать и блокировка выдачи

Согласовать 2 вида печати:
1) Фискальный чек для гостя — печатает/фиксирует Evotor (digital cashbox).
2) Внутренний талон/номер для стойки — опционально остаётся нашим `print_jobs`.

Требование из регламента продукта (важно):
- выдача на стойку (`ready`) должна происходить в согласованном с UX порядке.
- **переход `paid -> ready` разрешён только когда `payments.fiscal_status=done`** (фискальный чек Evotor успешно зарегистрирован).
- если Evotor фискализация `failed`:
  - заказ нельзя переводить в `ready`;
  - продукт должен показывать ошибку в бариста-очереди (и/или переводить заказ в `payment_failed/cancelled` — согласуем UX).

## 5.1 Правило в backend для бариста-действий (обязательное)
Чтобы запрет был непротиворечивым и безопасным:
- `POST /api/v1/barista/orders/{order_id}/ready` обязан проверять `payments.fiscal_status`.
- если `payments.fiscal_status != done`, endpoint должен:
  - возвращать ошибку (например `409 fiscalization_not_done`) и НЕ переводить заказ в `ready`.
- drag&drop paid -> ready также должен приводить к тому же backend-валидатору (нельзя “обойти” запрет через UI).

## 5.2 Поведение UI баристы
В карточке заказа (и/или рядом с CTA) показываем признак фискализации:
- `pending`: текст “Формируем чек (фискализация…)”, кнопка “Готово” и действие drag&drop в “Готово” отключены.
- `done`: “Готово” доступно.
- `failed`: кнопка “Готово” отключена, показываем текст “Чек не сформирован. По регламенту (повтор/звонок/ручная обработка).”

## 6. Требования ИБ (обязательный раздел)
См. отдельный документ:
- `docs/requirements/security/tochka-evotor-ib-checklist.md`

Кратко:
- webhook JWT подпись и строгая валидация payload
- secret management
- ретраи и защита от повторной доставки webhook
- запрет на логирование секретов/данных карт
- rate limiting и ограничения входящего трафика на webhook endpoint’ы

## 7. Приёмка (готовность к релизу)
1) Happy path:
   - guest оплатил через Tochka
   - webhook APPROVED пришёл и заказ стал `paid`
   - Evotor sell receipt успешно зарегистрирован и `fiscal_status=done`
   - barista видит заказ и может перевести его в `ready`
2) Негативные:
   - webhook приходит 2 раза — нет дублей/нет повторного public_number
   - Evotor недоступен — ретраи, при этом заказ не “ломается” и выдача не разблокируется
   - неверная подпись webhook — запрос отклоняется (4xx) и не меняет статусы

