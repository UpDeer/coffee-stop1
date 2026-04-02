import { InfoPageShell } from "@/components/InfoPageShell";

export default function PrivacyPage() {
  return (
    <InfoPageShell title="Политика обработки персональных данных">
      <div className="space-y-4 text-sm text-zinc-700">
        <section>
          <div className="font-semibold text-zinc-900">1. Оператор персональных данных</div>
          <p className="mt-2">
            Индивидуальный предприниматель: <strong>[ФИО ИП]</strong>
            <br />
            ИНН: <strong>[ИНН]</strong>
            <br />
            ОГРНИП: <strong>[ОГРНИП]</strong>
            <br />
            Адрес: Шарикоподшипниковская ул., 13 строение 33, Москва, 115088
            <br />
            Email: <a className="underline" href="mailto:coffee-stop1@yandex.ru">coffee-stop1@yandex.ru</a>
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">2. Какие данные мы обрабатываем</div>
          <p className="mt-2">
            Мы обрабатываем персональные данные, которые вы предоставляете при оформлении заказа (например, email), а также
            данные, необходимые для исполнения заказа и информирования о статусе.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">3. Цели обработки</div>
          <p className="mt-2">
            Оформление и исполнение заказа, информирование о статусе заказа, предоставление уведомлений и/или
            подтверждающих документов, а также осуществление связи с вами по вопросам заказа.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">4. Правовые основания</div>
          <p className="mt-2">
            Правовым основанием обработки персональных данных является согласие субъекта персональных данных и/или
            необходимость обработки для исполнения договора и/или исполнения требований законодательства Российской Федерации.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">5. Права субъекта</div>
          <p className="mt-2">
            Вы вправе требовать уточнения, блокирования или уничтожения персональных данных, а также обжаловать действия
            оператора в установленном законом порядке. Обращения направляйте по email: <a className="underline" href="mailto:coffee-stop1@yandex.ru">coffee-stop1@yandex.ru</a>.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">6. Сроки хранения</div>
          <p className="mt-2">
            Персональные данные хранятся не дольше, чем этого требуют цели обработки, и/или в течение сроков, установленных
            действующим законодательством Российской Федерации.
          </p>
        </section>

        <section>
          <div className="font-semibold text-zinc-900">7. Контакты</div>
          <p className="mt-2">
            По вопросам обработки персональных данных обращайтесь: <a className="underline" href="mailto:coffee-stop1@yandex.ru">coffee-stop1@yandex.ru</a>.
          </p>
        </section>
      </div>
    </InfoPageShell>
  );
}

