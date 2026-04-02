import { InfoPageShell } from "@/components/InfoPageShell";
import { sanitizeReturnPath } from "@/lib/returnNavigation";

export default async function OfferPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: returnRaw } = await searchParams;
  const closeHref = sanitizeReturnPath(returnRaw);

  return (
    <InfoPageShell title="Условия заказа / оферта" closeHref={closeHref}>
      <div className="space-y-4 text-sm text-zinc-700">
        <section>
          <div className="font-semibold text-zinc-900">1. Общие положения</div>
          <p className="mt-2">
            Настоящие условия определяют порядок оформления и исполнения заказа через сайт Coffee Stop (гостевой интерфейс).
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">2. Самовывоз</div>
          <p className="mt-2">
            Заказ предусматривает самовывоз. Выдача осуществляется по адресу места проведения мероприятия / точки выдачи
            в день продажи. Информация о месте выдачи сообщается в составе заказа и/или на странице статуса заказа.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">3. Оплата</div>
          <p className="mt-2">
            Оплата заказа производится с использованием платёжного провайдера/банковской инфраструктуры. Подтверждение оплаты
            предоставляется в соответствии с правилами платёжной системы.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">4. Порядок отмены</div>
          <p className="mt-2">
            Порядок отмены/изменения заказа зависит от статуса заказа. Если требуется отмена — обратитесь по контактам,
            указанным в разделе «Реквизиты ИП».
          </p>
        </section>
      </div>
    </InfoPageShell>
  );
}

