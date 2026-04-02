import type { Metadata } from "next";
import "./globals.css";

import GuestFooter from "@/components/GuestFooter";

export const metadata: Metadata = {
  title: "Coffee Stop — Guest",
  description: "Guest UI: menu → cart → payment → order status",
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
        <GuestFooter />
      </body>
    </html>
  );
}
