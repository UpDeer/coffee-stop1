# Эвотор MobCashier (online-продажа) для Coffee Stop Soft: MVP-решение

## Цель
Сделать оплату “онлайн” так, чтобы:
- гостю не нужно было запускать какое-либо приложение на телефоне;
- оплата проходила через контур Эвотора (мобильный кассир на стороне кассы/смарт-терминала);
- ваш backend переводил заказ в `paid` только после получения callback от Эвотора.

## Выбранные параметры (фиксируем)
Для MVP используем:
- `tax`: `NO_VAT`
- `payment_type`: `TAP_ON_PHONE`
- контакты покупателя: **только email**

## Основные ссылки из документации Эвотора
- `POST https://mobcashier.evotor.ru/api/v1/orders/create` (создание pre-чека / подготовка к оплате):  
  https://developer.evotor.ru/docs/api_v1_orders_create.html
- callback-данные о чеке / фискализации (`api_v3_asc_transfer`):  
  https://developer.evotor.ru/docs/api_v3_asc_transfer.html
- интеграция MobCashier (контекст, требования):  
  https://developer.evotor.ru/docs/mc_integration.html

## Как это ложится в наш order flow
Мы сохраняем вашу текущую схему “guest -> draft -> payment_pending -> paid”, но заменяем механизм подтверждения платежа:

1. Гость нажимает **«Оплатить»** на странице `pay`.
2. Front вызывает backend `checkout` (новый endpoint для Эвотора).
3. Backend:
   - переводит `order` из `draft` в `payment_pending`;
   - отправляет pre-чек в Эвотор через MobCashier `orders/create`;
   - сохраняет связи/идемпотентность.
4. Эвотор принимает оплату на своей стороне (касса/смарт-терминал с Mobile Cashier).
5. Эвотор вызывает ваш backend webhook callback.
6. Webhook переводит ваш `order` в `paid` и назначает `public_number`.

Важно: “редирект/ожидание” в UI не является источником истины. Истина — это callback с фискализованным чеком.

## Что отправляем в `orders/create`
### receipt_uuid
Рекомендуем сделать `receipt_uuid` стабильным и уникальным для заказа:
- `receipt_uuid = order_id` (1:1)

Причина: в документации упомянут кейс “неуникальный receipt_uuid уже был фискализирован ранее” — значит повторная попытка должна быть идемпотентной на вашей стороне.

### positions (каркас маппинга из вашей корзины)
Мы передаём позиции pre-чека в разрезе строк вашего заказа:
для каждой строки `order_lines` создаём одну `position` в Evotor:
- `name`: `menu_item_name_snapshot` + (при наличии) текст модификаторов
- `price`: цена за единицу (после добавления delta модификаторов, как у вас в totals)
- `quantity`: количество
- `settlement_method_type`: `FULL`
- `type`: `NORMAL` (по MVP без усложнений)
- `tax`: `NO_VAT`
- (опционально) `measureName`: фиксированно (например `шт`)

### client_email
Передаём:
- `client_email = orders.guest_email`

Телефон не передаём (только email).

### payment_type
Передаём:
- `payment_type = TAP_ON_PHONE`

### cashier_uuid
В документации `orders/create` поле `cashier_uuid` используется как идентификатор сотрудника/кассира в приложении.

Для MVP предполагаем, что `cashier_uuid` **настраивается заранее** (например в `.env`), а не берётся “динамически из списка” во время checkout.

## Webhook: как переводим в `paid`
Добавляем отдельный webhook endpoint, который принимает callback от Эвотора.
В webhook-обработчике:
1) находим `order_id` по `receipt_uuid` (лучше связь хранить в `payments`, либо отдельной таблице)
2) проверяем, что фискализация успешна:
   - из callback берём `fiscalization.fiscalized`
3) если `fiscalized == true` и заказ в состоянии `payment_pending`:
   - переводим `status` в `paid`
   - назначаем `public_number`
4) иначе переводим в “неуспешное” состояние (MVP: `cancelled` или `payment_failed` — нужно будет согласовать UX).

## Идемпотентность (обязательное правило)
Чтобы избежать дублей:
- храните в БД связь `order_id <-> receipt_uuid` и “обработан callback или нет”
- если callback пришёл повторно — webhook не должен назначать `public_number` второй раз и не должен менять статус повторно.

## Что считается “MVP готово”
После реализации вы должны уметь:
- из guest UI получить заказ в `paid` после callback от Эвотора;
- увидеть `paid` на barista-очереди;
- увидеть корректное уведомление/экран статуса (как уже сейчас).

