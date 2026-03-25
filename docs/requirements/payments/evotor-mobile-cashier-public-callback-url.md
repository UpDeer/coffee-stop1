# Что нужно получить: публичный HTTPS URL для callback MobCashier

## Почему нужен открытый URL
При использовании `callback` в запросе `orders/create` от MobCashier Эвотор вызывает ваш сервис по указанному адресу.
Если адрес недоступен извне по `https`, callback не сможет доставить статус оплаты/фискализации.

## Что нужно именно от нас
1. Поднять backend endpoint, который будет принимать callback:
   - например `POST /api/v1/webhooks/evotor/mobcashier`
2. Получить публичный URL на этот backend endpoint, доступный с интернета по `https`.

## Требования к URL
- обязательно `https://`
- доступен снаружи (не `127.0.0.1`, не локальная сеть)
- должен пробрасывать запросы `POST` в ваш backend

## Как обычно получают публичный URL (dev)
Самый простой способ в dev:
- запустить tunnel (например `ngrok` / аналог),
- прокинуть tunnel на локальный порт backend (у вас обычно `:8000`)
- в env прописать базовый URL, который будет использоваться при формировании `callback.url`

Пример (шаблон, конкретный домен будет твоим):
- `EVOTOR_CALLBACK_BASE_URL=https://<your-ngrok-domain>`
- тогда `callback.url` = `${EVOTOR_CALLBACK_BASE_URL}/api/v1/webhooks/evotor/mobcashier`

## Что нужно зафиксировать у вас (когда появится URL)
Когда будет готов публичный URL, нужно записать:
1. полный callback URL (конечный адрес, включая path)
2. потребуется ли auth к callback (в MVP можно начать без, но лучше иметь секрет)
3. какая платёжная модель и endpoint checkout будут использоваться (в MVP: `TAP_ON_PHONE`, `NO_VAT`, email-only)

## Чек-лист готовности перед тестом
- [ ] Backend endpoint callback реально доступен извне по `https` (проверяется curl/браузером)
- [ ] Callback возвращает 200 на валидный payload
- [ ] В backend есть идемпотентная обработка webhook’ов (чтобы не назначать `public_number` повторно)

