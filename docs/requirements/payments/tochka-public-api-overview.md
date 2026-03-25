# Точка.API: что это и как мы используем (payment links + webhook)

## Коротко: что даёт Точка.API
Точка Public API (интернет-эквайринг) позволяет вашему сервису:
1) создавать **платёжные ссылки** (страница оплаты для гостя);  
2) получать **вебхук-уведомления** о факте оплаты через webhook;  
3) (опционально) делать **возвраты** по операциям, созданным через платёжные ссылки;  
4) контролировать статусы оплат через API-методы.

Официальная база:
- «Платёжные ссылки»: описание модели, параметры `Create Payment Operation` и `Create Payment Operation With Receipt`, статусы и возвраты — https://developers.tochka.com/docs/tochka-api/opisanie-metodov/platyozhnye-ssylki  
- «Вебхуки»: типы webhook, подпись/проверка, `acquiringInternetPayment`, поведение ретраев — https://developers.tochka.com/docs/tochka-api/opisanie-metodov/vebhuki

## Что умеют платёжные ссылки

### 1) Без фискализации
Платёжная ссылка создаётся методом `Create Payment Operation`. Под капотом сервис поддерживает оплату:
- картой (`card`)
- T-pay (`tinkoff`)
- SBP/QR (`sbp`)
- “Долями” (`dolyame`)

Список доступных `paymentMode` можно узнать через `Get Retailers`.  
Состояние подключения интернет-эквайринга проверяется через `Get Retailers`: статус `REG` и `isActive: "true"` означают, что можно работать с платёжными ссылками.  
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/platyozhnye-ssylki

### 2) С фискализацией чека (наш основной вариант)
Если нужно, чтобы чек формировался “сразу” в момент оплаты, используется метод:
`Create Payment Operation With Receipt`.

В этом режиме вы передаёте:
- `client` (контакты покупателя для отправки электронного чека, в документации фигурирует `Email`)  
- `items` (список позиций в чеке): `name`, `amount` (цена за единицу), `quantity`

Дополнительно можно указать:
- `redirectUrl` и `failRedirectUrl`
- `ttl` (время жизни ссылки)
- `paymentLinkId` (наш стабильный идентификатор заказа)
  
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/platyozhnye-ssylki

## Как подтверждать оплату (Webhook)
Для признания оплаты “истиной” мы подписываемся на webhook событие:
`acquiringInternetPayment`.

Это событие отправляется **только когда по ссылке платят**:
- картой
- и/или через SBP

В payload есть:
- `status`:
  - `AUTHORIZED` — деньги заморожены (актуально только для двухэтапной оплаты)
  - `APPROVED` — оплата завершена (деньги списаны)
- `operationId` (идентификатор операции; используется для follow-up: статус/возврат)
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/vebhuki

### Безопасность webhook
Точка шлёт webhook как POST-запрос с телом, которое является **JWT**, подписанным по RS256.
Нужно:
1) расшифровать/проверить подпись;
2) использовать публичный ключ OpenAPI.
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/vebhuki

### Ограничения хоста и ретраи
Вебхук можно создать/изменить только для `https` на порт `443`.
Если вы не ответили `HTTP 200`, Точка отправит webhook повторно до 30 раз с периодичностью в 10 секунд.
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/vebhuki

## Возвраты
Возврат возможен **только** для платежей в статусе `APPROVED`.
Возврат делается по `operationId` через `Refund Payment Operation`.
Источник: https://developers.tochka.com/docs/tochka-api/opisanie-metodov/platyozhnye-ssylki

## Как это ложится на наш заказ (draft -> payment_pending -> paid)
Наша модель остаётся простой и соответствует документации:
1) `draft` — заказ создан (корзина до оплаты)
2) `payment_pending` — вызвали `Create Payment Operation With Receipt` и получили ссылку/операцию
3) `paid` — меняем статус заказа только когда получили webhook с `status=APPROVED`

Редиирект/страница оплаты гостя:
- может использоваться только для UX (“оплата происходит/ждите”),
- но источник истины — webhook.

Идемпотентность:
- ключ дедупа = `operationId` из webhook или `paymentLinkId`,
- `public_number` и `OrderEvent(payment_succeeded)` назначаются только один раз.

## Вывод для команды
Точка.API “payment links + webhook APPROVED” отлично ложится в нашу архитектуру:
- мы создаём ссылку в момент `checkout` и ведём гостя на статус,
- затем переводим заказ в `paid` только по `acquiringInternetPayment` и `APPROVED`.

Также из документации становится понятно, что для режима `With Receipt` важны:
- контакты клиента (в документации явно фигурирует `Email`),
- корректная обработка JWT-подписей webhook,
- наличие публичного `https` endpoint’а на порт `443` для webhook.

