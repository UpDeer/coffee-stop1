# Tochka (payment links + webhook acquiringInternetPayment): production checklist

## Важный принцип
Истина по оплате — webhook Tochka:
- `webhookType = acquiringInternetPayment`
- `status = APPROVED`

Редирект/UX-страницы гостя не являются источником истины.

## 1) Что нужно сделать в Tochka (кабинет)
1. Включить **Интернет-эквайринг** для своего магазина.
2. Убедиться, что торговая точка активна:
   - `Get Retailers`: `status=REG` и `isActive=true`
3. Подготовить доступы/API token:
   - нужен Bearer token для создания payment links (acquiring endpoints)
4. Подготовить webhook:
   - Тип события: `acquiringInternetPayment`
   - URL: публичный HTTPS URL нашего backend

## 2) URL webhook (куда Tochka шлёт)
Наш сервер принимает:
- `POST /api/v1/webhooks/tochka/acquiring-internet-payment`

Требования:
- URL должен быть публично доступен по HTTPS
- Tochka шлёт тело webhook как JWT (RS256)

## 3) Какие env-переменные нужны (backend)
Минимум (см. `coffee_stop_soft/.env.example`):
- `TOCHKA_API_BEARER_TOKEN`
- `TOCHKA_CUSTOMER_CODE`
- `TOCHKA_MERCHANT_ID` (если требуется; иначе можно оставить пустым)
- `TOCHKA_PAYMENT_REDIRECT_URL`
- `TOCHKA_PAYMENT_FAIL_REDIRECT_URL`
- `TOCHKA_WEBHOOK_PUBLIC_JWK_JSON` — JWK JSON (RS256) для проверки подписи JWT

Дополнительно:
- `TOCHKA_PAYMENT_PURPOSE`
- `TOCHKA_PAYMENT_TTL_MINUTES`
- `TOCHKA_PAYMENT_MODES` (например `card,sbp`)

## 4) Какой запрос отправляем Tochka при checkout
Наш endpoint (когда гость нажимает “Оплатить”):
- `POST /api/v1/public/orders/{order_id}/checkout/tochka`

Он вызывает Tochka:
- `POST https://enter.tochka.com/acquiring/v1.0/payments`

Заголовки:
- `Authorization: Bearer <TOCHKA_API_BEARER_TOKEN>`
- `Content-Type: application/json`

Тело (шаблон, сервер подставляет сумму/ID заказа):
```json
{
  "amount": "350.00",
  "customerCode": "<TOCHKA_CUSTOMER_CODE>",
  "purpose": "Оплата заказа Coffee Stop (<order_id>)",
  "paymentMode": ["card", "sbp"],
  "paymentLinkId": "<order_id>",
  "redirectUrl": "<TOCHKA_PAYMENT_REDIRECT_URL>",
  "failRedirectUrl": "<TOCHKA_PAYMENT_FAIL_REDIRECT_URL>",
  "ttl": 1440,
  "merchantId": "<TOCHKA_MERCHANT_ID>"
}
```

Нам нужны из ответа:
- `operationId` (сохраняем в `payments.provider_payment_id`)
- `paymentUrl` (отдаём фронту как `payment_url`)

## 5) Webhook: что именно проверяем
По JWT в теле:
1. Проверяем RS256 подпись по `TOCHKA_WEBHOOK_PUBLIC_JWK_JSON`
2. Проверяем:
   - `webhookType === "acquiringInternetPayment"`
   - `status === "APPROVED"`
3. Забираем `operationId`

## 6) Идемпотентность (как избежать дублей)
Идемпотентность делается по:
- `payments.provider = 'tochka_payment_links'`
- `payments.provider_payment_id = operationId`

Повторы webhook:
- не должны назначить `public_number` повторно
- не должны ломать переходы статусов

## 7) Что делает backend при `APPROVED`
При `status=APPROVED`:
1. `payment_pending -> paid`
2. атомарно назначает `public_number` (как в `_mark_paid_and_assign_number`)
3. ставит `payments.fiscal_status = pending`
4. запускает фискализацию в фоне (Evotor integration)

## 8) Минимальный тест-план
1. `draft` order -> `/checkout/tochka` -> получить `payment_url`
2. Открыть `payment_url`, оплатить в тестовой среде Tochka
3. Убедиться, что пришёл webhook и order стал `paid`
4. Убедиться, что `payments.fiscal_status` меняется далее по Evotor
5. Повторно прислать webhook (если есть тестовая отправка) и проверить:
   - нет дублей `public_number`
   - нет повторных событий

