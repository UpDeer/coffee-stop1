import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";

import GuestFooter from "@/components/GuestFooter";

export const metadata: Metadata = {
  title: "Coffee Stop — Guest",
  description: "Guest UI: menu → cart → payment → order status",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <Suspense
          fallback={
            <footer className="border-t border-zinc-200 bg-white/80 px-4 py-6">
              <div className="mx-auto max-w-xl text-xs text-zinc-500">© Coffee Stop</div>
            </footer>
          }
        >
          <GuestFooter />
        </Suspense>
      </body>
    </html>
  );
}
