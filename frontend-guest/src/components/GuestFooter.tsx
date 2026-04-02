import Link from "next/link";

export default function GuestFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white/80 px-4 py-6">
      <div className="mx-auto flex max-w-xl flex-col gap-3 text-sm text-zinc-600">
        <div className="text-xs text-zinc-500">© Coffee Stop</div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="hover:text-zinc-900">
            Политика обработки персональных данных
          </Link>
          <Link href="/requisites" className="hover:text-zinc-900">
            Реквизиты ИП
          </Link>
          <Link href="/offer" className="hover:text-zinc-900">
            Условия заказа / оферта
          </Link>
          <Link href="/payment" className="hover:text-zinc-900">
            Оплата и кассовый чек
          </Link>
        </nav>
      </div>
    </footer>
  );
}

