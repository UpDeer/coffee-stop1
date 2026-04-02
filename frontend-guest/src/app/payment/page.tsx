export default function PaymentPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Оплата и кассовый чек</h1>

      <div className="space-y-4 text-sm text-zinc-700">
        <section>
          <div className="font-semibold text-zinc-900">Как происходит оплата</div>
          <p className="mt-2">
            Оплата заказа осуществляется через банк и/или платёжный сервис (платёжного провайдера). Вы перенаправляетесь
            на страницу/в интерфейс оплаты провайдера.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">Кассовый чек</div>
          <p className="mt-2">
            Кассовый чек (подтверждение оплаты) формируется и предоставляется в порядке, установленном банком и/или
            платёжным провайдером. Конкретный способ предоставления чека зависит от выбранного способа оплаты и условий банка.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">Статус заказа</div>
          <p className="mt-2">
            После успешной оплаты статус заказа обновляется по данным платёжной системы и/или сервера. Раздел «Статус заказа»
            автоматически обновляется (polling) и показывает текущий статус заказа.
          </p>
        </section>
      </div>
    </main>
  );
}

