# Карта движения: БД -> выдача стакана гостю (MVP)

Эта схема привязана к текущей реализации в репозитории (mock-оплата + ручное действие бариста `paid -> ready`).
Печать (`print_jobs`) и `picked_up` сейчас в коде не реализованы — оставлены как будущие шаги.

```mermaid
flowchart LR
  %% ============ UI / АПИ ============
  subgraph UI[Guest UI / Barista UI]
    Cart[Cart: /s/{slug}/cart]
    Pay[Pay: /s/{slug}/pay]
    Status[OrderStatus: /s/{slug}/order/{orderId} (polling)]
    Barista[Barista admin]
  end

  subgraph API[Backend endpoints]
    Menu[getStoreMenu: GET /public/stores/{slug}/menu]
    CreateOrder[POST /public/stores/{slug}/orders\n-> create draft]
    Checkout[POST /public/orders/{orderId}/checkout\n-> payment_pending + payment_url]
    MockPay[POST /webhooks/payments/mock/succeed/{orderId}\n-> paid + public_number]
    GetStatus[GET /public/orders/{orderId}/status]
    MarkReady[POST /barista/orders/{orderId}/ready\n-> ready + ready_at]
  end

  %% ============ БД ============
  subgraph DB[PostgreSQL]
    Stores[stores: slug -> store]
    Orders[orders: status + public_number + ready_at]
    Lines[order_lines]
    Mods[order_line_modifiers]
    Payments[payments]
    Seq[store_order_sequences]
    Events[order_events]
  end

  %% ============ Поток ============
  Guest[Гость / клиент] --> Menu --> Cart

  Cart --> CreateOrder
  CreateOrder -->|INSERT| Orders
  CreateOrder -->|INSERT| Lines
  CreateOrder -->|INSERT| Mods
  CreateOrder -->|INSERT| Events

  %% orders.status: draft
  Orders -- draft --> Checkout
  Checkout -->|INSERT| Payments
  Checkout -->|UPDATE| Orders
  Checkout -->|INSERT| Events

  %% orders.status: payment_pending
  Orders -- payment_pending --> MockPay
  MockPay -->|INSERT/UPDATE| Seq
  MockPay -->|UPDATE| Payments
  MockPay -->|UPDATE| Orders
  MockPay -->|INSERT| Events

  %% orders.status: paid
  Orders --> GetStatus --> Status
  Status -->|polling каждые 2 сек| GetStatus

  %% paid -> barista action
  Status --> Barista
  Barista --> MarkReady
  MarkReady -->|UPDATE| Orders
  MarkReady -->|INSERT| Events

  %% orders.status: ready
  Orders -- ready --> GetStatus

  %% future steps
  Orders -.future.-> PrintJobs[print_jobs (planned)]
  Orders -.future.-> PickedUp[picked_up (planned)]

  %% ============ Человекочитаемое ============
  Status -.read model.-> Orders
```

