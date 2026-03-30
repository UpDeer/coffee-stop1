Цель

Сделать поток QR → веб-заказ → онлайн-оплата → производство → печать номера → самовыдача на столе. Два интерфейса: гостевой веб-сервис и рабочее место бариста (веб-админка).

Ключевые допущения (можно поменять позже)





QR ведёт на страницу конкретной точки (store) и/или конкретной зоны (этаж/стол выдачи).



Выдача без сканирования: гость ищет стакан по крупному номеру заказа на бумажке.



Печать в точке на термопринтер ESC/POS.

Поток данных (схема)

flowchart LR
  Guest[Guest] -->|scanQR| QRLanding[QR_Landing]
  QRLanding --> WebMenu[Web_Menu]
  WebMenu --> Cart[Cart_Customize]
  Cart --> Pay[Payment]
  Pay -->|success| OrderCreated[Order_Created]

  OrderCreated --> BaristaBoard[Barista_Board]
  BaristaBoard -->|start| InProgress[In_Progress]
  InProgress -->|readyToPickup| Ready[Ready]

  Ready --> Print[Print_Ticket_Number]
  Ready --> Notify[Notify_Ready]
  Notify -->|WebPush_or_Email| Guest
  Print --> PickupTable[Pickup_Table]
  Guest -->|findNumber| PickupTable

  Pay -->|fail_or_cancel| PayFailed[Payment_Failed]
  OrderCreated -->|refundFlow_if_needed| Refund[Refund]

Архитектура (MVP)





Frontend (Guest PWA): публичная веб-страница меню/корзины/оплаты. Мобильная-first.



Frontend (Barista Web): приватная админка: очередь, статусы, печать, переназначение/отмена.



Backend API:





Orders, Menu, Stores



Payment intents + webhooks



Printer jobs (очередь печати)



Realtime обновления (SSE/WebSocket) для бариста-экрана



Уведомления: отправка гостю о готовности заказа (см. ниже).



DB: сущности заказов, платежей, точек, принтеров, событий.



Print service (локально в точке): небольшой агент/служба, которая принимает задания печати по HTTPS из бэкенда и печатает на ESC/POS (USB/LAN). Это надёжнее, чем «печать из браузера».

Статусы заказа (минимум)





draft (корзина до оплаты)



payment_pending



paid



accepted (бариста принял)



in_progress



ready



picked_up (опционально, отмечает бариста/авто-таймаут)



cancelled / refunded

Что печатаем и как оформляем самовыдачу





Крупный номер (например, 3–4 цифры) + QR/штрихкод мелко (на будущее) + время.



Номер генерировать уникальным в рамках точки и дня (например, 001–999 с перезапуском) и хранить связь publicOrderNumber → orderId.



На столе выдачи сделать понятные зоны:





таблички «Готово»



опционально: разделение по диапазонам 001–199, 200–399, … чтобы ускорить поиск.

Безопасность и антифрод (критично при предоплате)





QR-ссылка должна быть вида https://.../s/{storeSlug}?t=<shortToken>:





токен ограничить по времени/ротации (например, суточный) или подписанный (JWT/HMAC).



Платёжная схема:





идемпотентность создания платежа



webhooks: единственный источник истины paid



Ограничения:





rate limit на создание заказов с одного IP/устройства



защита промо/купонных механик (если будут)

Набор этапов реализации (по шагам)

Этап 0. Проектирование (1–2 дня)





Описать пользовательские сценарии (guest + barista) и макеты экранов.



Выбрать провайдера оплаты (ЮKassa/CloudPayments/Тинькофф/Stripe — зависит от страны) и модель (payment intent + webhook).



Выбрать модель печати: локальный print-agent (рекомендуется).

Этап 1. База данных + API (ядро)





Сущности:





Store, MenuCategory, MenuItem, ModifierGroup, ModifierOption



Order, OrderItem, OrderModifier



Payment, Refund



Printer, PrintJob



OrderEvent (аудит: кто/когда сменил статус)



API:





публичное: меню точки, создание draft, расчёт суммы, создание платежа



приватное: очередь заказов, смена статусов, печать



Генерация publicOrderNumber и правила уникальности.

Этап 2. Guest веб-сервис по QR (PWA)





QR landing: определяет точку, показывает «Заказать здесь».



Меню + карточка товара + кастомизация (минимум: размер/молоко/сироп).



Корзина + итог + “Оплатить” (DONE: корзина/итог/переход на экран оплаты; реальная оплата пока mock).



Экран “Заказ принят / готовится / готово” (polling или SSE).
MVP: статическая оценка ожидания по статусу (paid/ready) уже есть; расчет приблизительного времени относительно очереди заказов — реализовано (estimated_wait_minutes для paid заказов).

Этап 3. Онлайн-оплата





Интеграция с провайдером:





создание платежа, редирект/виджет



обработка success/fail



webhook меняет заказ в paid



Обработка возвратов: ручной refund из бариста-админки.

### Конкретика для реализации (Точка.API)

**Выбор механики**: Точка → **платёжные ссылки**.

**Фискализация**: НЕ через Точку. Деньги подтверждаем webhook Tochka (`acquiringInternetPayment`, `APPROVED`), а фискальный чек формируем в Evotor после `paid`.

**Важно**: редирект гостя на `redirectUrl` — не подтверждение оплаты; подтверждение только webhook/статус операции.

#### 3.1. Создание платёжной ссылки (checkout)

Что делает `POST /public/orders/{order_id}/checkout/tochka` (production):

- Проверяет, что заказ в статусе `draft` (или допускаем повторный `payment_pending`).
- Рассчитывает сумму на сервере (не доверяем фронту).
- Делает **идемпотентное** создание платёжной ссылки в Точке:
  - ключ идемпотентности = `order_id` (или заголовок `Idempotency-Key`)
  - если для заказа уже есть незавершённая операция — возвращает **ту же** `payment_url`
- Передаёт в Точку:
  - `amount` (в рублях)
  - `paymentLinkId` = `order_id` (или другой стабильный идентификатор)
  - `purpose` (например `CoffeeStop order <order_id>` или с `public_number`)
  - `redirectUrl`, `failRedirectUrl`
  - `paymentMode` (например `card` + `sbp`)
  - ВАЖНО: без фискализации чека в Точке (используем `Create Payment Operation`, без `items[]/client.*`).
    Фискальный чек формируем в Evotor после `paid`.
- Сохраняет в БД:
  - `provider=tochka_payment_links`
  - `payment_status=payment_pending`
  - идентификаторы операции (`paymentLinkId`, затем `operationId` из webhook)
  - «сырой» ответ провайдера (`provider_payload`) для отладки
- Переводит заказ в `payment_pending` и отдаёт `{ payment_url, status: "payment_pending" }`.

#### 3.2. Webhook как единственный источник истины (paid)

Событие оплаты по ссылке от Точки: **`acquiringInternetPayment`**. Успешный платёж: `status=APPROVED`.

Обработчик webhook обязан:

- Проверять подлинность (строго по документации и требуемой схеме подписи/валидации).
- Быть **идемпотентным**:
  - `operationId` уникален
  - повтор события не должен дублировать `public_number`, `OrderEvent`, email и т. п.
- Маппить статусы провайдера → наши статусы:
  - `APPROVED` → `paid` (и назначаем `public_number`, если ещё нет)
  - остальные статусы → остаёмся в `payment_pending` или переводим в `payment_failed` (по политике и типу статуса)

#### 3.3. Экран гостя после оплаты

Guest UI после редиректа показывает «Оплата обрабатывается» и подтягивает `GET /public/orders/{order_id}/status` polling/SSE, пока не увидит `paid` (или `payment_failed`).

#### 3.4. Refund (возвраты)

Возврат запускается из бариста-админки:

- Находим `operationId` по заказу.
- Вызываем refund-операцию у Точки.
- После успеха — переводим заказ в `refunded`/`cancelled`, пишем `OrderEvent`.

#### 3.5. План Б по фискализации (Эвотор «Цифровая касса»)

Если потребуется отдельный фискальный контур:

- `paid` фиксируем по webhook Точки как обычно.
- Затем отдельный воркер/джоба отправляет чек в Эвотор «Цифровая касса» (API заявлено как ATOL‑совместимое; есть тестовый контур `https://fiscalization-test.evotor.ru`).
- В текущей реализации: Evotor вызов ещё не включён (пока безопасная заглушка, чтобы `paid -> ready` не открывался без `fiscal_status=done`).
- ВАЖНО (правило продукта): переход `paid -> ready` в бариста-очереди разрешён ТОЛЬКО когда `payments.fiscal_status = done`.
- `pending`: кнопка “Готово” и drag&drop в “Готово” отключены, показываем “Формируем чек (фискализация...)”.
- `failed`: “Готово” отключена, показываем “Чек не сформирован...” (по регламенту; повтор/звонок/ручная обработка).
- `done`: “Готово” доступно.

#### 3.6. Статус реализации (Tochka + Evotor)

DONE (в коде):
- добавлены поля `fiscal_*` в `payments` + миграция
- добавлен `POST /public/orders/{order_id}/checkout/tochka` (создание payment link в Точке)
- добавлен `POST /webhooks/tochka/acquiring-internet-payment` (JWT RS256, идемпотентность по `operationId`)
- в бариста API/UI добавлена блокировка `paid -> ready` до `payments.fiscal_status=done`

ЧТО ЕЩЁ ОСТАЛОСЬ:
- подключить реальный Evotor API вызов (сейчас безопасная заглушка/режим mock)
- реализовать полноценный retry/backoff policy и алерты для `fiscal_status=failed`
- добавить production-runbook по webhook мониторингу (доставка, ретраи, дедупы)

Этап 4. Barista админка (операционный контур)





Очередь заказов по статусам: paid (новые), ready (готово) (DONE: drag&drop paid <-> ready и переходы paid->ready/ready->paid; обновление через polling; `paid -> ready` дополнительно блокируется до `payments.fiscal_status=done`).



Карточка заказа: состав, модификаторы, сумма, public_number (DONE).



Кнопки: accept/start/cancel — отложено; ready/paid — реализовано (DONE).



Автообновление списка (SSE/WebSocket) — MVP сейчас через polling (отложить SSE/WebSocket).

Меню точки (DONE): вкладка/экран “Меню точки” с редактором категорий/позиций/модификаторов, фото по URL и опцией “без фото”, а также остаток `stock_qty` (только для баристы). Гостевое меню скрывает позиции при `stock_qty = 0`/не в продаже.

Этап 5. Печать на термопринтер





MVP (DONE частично): в бариста-UI есть stub печати — кнопка “Печать (stub)” и отметка “печать завершена” через localStorage.
Реальный print-agent/ESC-POS (очередь печати, ретраи, подтверждение печати, регистрация принтера) — отложено.

Спецификация чека: крупный номер, состав (опц.), время, предупреждения.



PrintJob при переводе в ready:





отправка в локальный print-agent



ретраи + подтверждение печати



Print-agent:





регистрация принтера



healthcheck



очередь печати, лог ошибок

Этап 5.1. Уведомление о готовности заказа





Момент отправки: при переходе заказа в статус ready (одновременно или сразу после постановки печати).



Содержимое: короткое сообщение «Ваш заказ №XXX готов, можно забирать» + при необходимости ссылка на страницу статуса заказа.



Каналы для MVP (DONE): Web Notifications в браузере (если разрешено) + Email.





Web Notifications — запрос разрешения до оплаты; показ уведомления при переходе заказа в `ready`.



Email — отправляется с задержкой 5 секунд после постановки `ready`, только если заказ всё ещё `ready` (DONE: проверка статуса перед отправкой).



Позже (не блокирует MVP): SMS, Telegram и другие каналы по необходимости.



Технически: отдельный job/обработчик при смене статуса на ready: формирует сообщение, выбирает канал по данным заказа (push-subscription / email), вызывает провайдера (VAPID/FCM для Web Push, SMTP/транзакционная почта). Логировать факт отправки и ошибки для повторной попытки.



Гость без контактов: если нет ни email, ни подписки на push — только обновление экрана «Статус заказа» при открытой вкладке (polling/SSE уже есть в Этапе 2).

Этап 6. Самовыдача на столе





Операционный регламент:





где кладём стаканы (линейка/полки)



как раскладывать при пике



SLA: через сколько минут непринятые заказы убираем/утилизируем



Опционально (сильно улучшает UX): простой “табло готовности” на мониторе рядом со столом (список номеров ready).

Этап 7. Наблюдаемость и качество

Инфраструктура/прод (DONE):
- Добавлены `Dockerfile` для `backend`, `frontend-guest`, `frontend-barista`.
- Добавлен GHCR workflow: `.github/workflows/build-and-push-ghcr.yml` (build/push образов).
- Добавлен production compose: `docker-compose.prod.yml`.
- Применена схема БД в проде (таблицы `stores`, `menu_items` и т.д. — `backend/schema.sql` / миграции).
- Настроен reverse proxy в Nginx: `deploy/nginx/conf.d/coffee-stop.conf` (проксирование на контейнеры).
- HTTPS/TLS в проде: `certbot` (Let’s Encrypt) + хранение сертификатов в `deploy/certbot/*`.
- Frontend (гость/бариста): автоопределение `api.*` по текущему домену (для корректной работы за Nginx).

Переменные окружения, которые введены (в `*.env.prod.example`):
- `DOMAIN`
- `COFFEE_STOP_BACKEND_IMAGE`, `COFFEE_STOP_GUEST_IMAGE`, `COFFEE_STOP_BARISTA_IMAGE`
- `DB_PASSWORD`, `DATABASE_URL`
- `CORS_ORIGINS`
- Email: `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_USE_TLS`
- Tochka: `TOCHKA_API_BASE_URL`, `TOCHKA_API_BEARER_TOKEN`, `TOCHKA_CUSTOMER_CODE`, `TOCHKA_MERCHANT_ID`, `TOCHKA_PAYMENT_PURPOSE`, `TOCHKA_PAYMENT_REDIRECT_URL`, `TOCHKA_PAYMENT_FAIL_REDIRECT_URL`, `TOCHKA_PAYMENT_TTL_MINUTES`, `TOCHKA_PAYMENT_MODES`, `TOCHKA_WEBHOOK_PUBLIC_JWK_JSON`
- Evotor: `EVOTOR_INTEGRATION_MODE`, `EVOTOR_FISCALIZATION_URL`, `EVOTOR_LOGIN`, `EVOTOR_PASSWORD`, `EVOTOR_GROUP_CODE`, `EVOTOR_CASHIER_UUID`
- Для SSR fallback в контейнерах: `API_INTERNAL_BASE_URL`

Метрики:





время paid→ready



доля отмен/возвратов



ошибки печати



конверсия QR→оплата



Логи аудита по статусам (OrderEvent).

Тест-план (MVP)





Сквозной сценарий: QR → заказ → оплата → появление у бариста → ready → печать + уведомление гостю → самовыдача.



Негативные: двойной клик оплаты (идемпотентность), webhook пришёл дважды, принтер офлайн, отмена после оплаты.

Файлы/артефакты, которые добавим в репо





docs/requirements/order-flow.md (user stories + статусы)



docs/diagrams/ (обновим/добавим схему под ваш вариант выдачи)



backend/ (API + webhooks + jobs)



frontend-guest/ (PWA)



frontend-barista/ (админка)



print-agent/ (локальная служба печати)

Риски и решения





Гости путаются на столе → таблички/зоны + опциональное табло номеров.



Оплата прошла, а точка не приняла → алерт бариста, авто-таймаут и авто-рефанд по политике.



Печать падает → ретраи + ручная “пере-печать” из админки.

