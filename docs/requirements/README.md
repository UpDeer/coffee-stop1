# Требования и проектирование

- **[order-flow.md](order-flow.md)** — сценарии и экраны: гость (QR → меню → корзина → оплата → статус) и бариста (очередь, смена статусов). Таблица статусов заказа.
- **[stage0-decisions.md](stage0-decisions.md)** — оплата (простыми словами), Точка/Эватор, печать, polling/push.
- **[domain-model.md](domain-model.md)** — **Этап 1**: сущности, статусы, правило `public_number`, индексы.
- **[api-v1.md](api-v1.md)** — **Этап 1**: контракты REST API (гость, бариста, webhook, print-agent).
- **payments/** — справка по оплате и фискализации:\n
  - **[payments/tochka-payment-links.md](payments/tochka-payment-links.md)** — Точка: платёжные ссылки, `With Receipt`, статусы и привязки.\n
  - **[payments/evotor-digital-cashbox.md](payments/evotor-digital-cashbox.md)** — Эвотор «Цифровая касса»: фискализация как план Б.\n
  - **[payments/implementation-checklist.md](payments/implementation-checklist.md)** — чек-лист внедрения (секреты, БД, webhook, тест-план).

SQL-схема: [../../backend/schema.sql](../../backend/schema.sql).  
Стек и цель (FastAPI, production): [stack.md](stack.md).
