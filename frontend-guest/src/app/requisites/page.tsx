import { InfoPageShell } from "@/components/InfoPageShell";
import { sanitizeReturnPath } from "@/lib/returnNavigation";

export default async function RequisitesPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: returnRaw } = await searchParams;
  const closeHref = sanitizeReturnPath(returnRaw);

  return (
    <InfoPageShell title="Реквизиты ИП" closeHref={closeHref}>
      <div className="space-y-4 text-sm text-zinc-700">
        <section>
          <div className="font-semibold text-zinc-900">Индивидуальный предприниматель</div>
          <p className="mt-2">
            ИП <strong>[ФИО ИП]</strong>
            <br />
            ИНН: <strong>[ИНН]</strong>
            <br />
            ОГРНИП: <strong>[ОГРНИП]</strong>
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">Адрес</div>
          <p className="mt-2">Шарикоподшипниковская ул., 13 строение 33, Москва, 115088</p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">Контакты</div>
          <p className="mt-2">
            Email:{" "}
            <a className="underline" href="mailto:coffee-stop1@yandex.ru">
              coffee-stop1@yandex.ru
            </a>
          </p>
        </section>
      </div>
    </InfoPageShell>
  );
}

