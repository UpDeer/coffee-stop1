export function formatRublesFromCents(amountCents: number): string {
  const rub = amountCents / 100;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(rub);
}

