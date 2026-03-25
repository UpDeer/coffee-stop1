## Coffee Stop — Guest UI (Next.js)

Guest UI: `QR (/s/{slug}) → menu → cart → checkout → order status`.

### Prerequisites

- Node.js 20+ (у тебя уже стоит)
- Запущен backend API на `http://127.0.0.1:8000`

### Environment

Создай файл `.env.local` в `frontend-guest/`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

### Run

```bash
npm install
npm run dev
```

Открой `http://localhost:3000`, затем:

- `http://localhost:3000/s/demo` — меню (если сиды/демо-точка созданы)

### Notes

- В dev сейчас используется mock checkout: `payment_url` может быть относительным (`/api/v1/webhooks/payments/mock/...`).\n
  Guest UI обрабатывает это как “dev оплату”: дергает URL и переводит на экран статуса заказа.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
