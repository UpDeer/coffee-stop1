"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ItemCustomizeModal } from "@/components/ItemCustomizeModal";
import type { MenuItem } from "@/lib/types";

export function ItemCustomizeModalPageClient({
  slug,
  item,
}: {
  slug: string;
  item: MenuItem;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");

  const withQr = (href: string) => {
    if (!qrToken) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}t=${encodeURIComponent(qrToken)}`;
  };

  return (
    <ItemCustomizeModal
      slug={slug}
      item={item}
      onClose={() => {
        router.replace(withQr(`/s/${encodeURIComponent(slug)}`));
      }}
      onPay={() => {
        router.replace(withQr(`/s/${encodeURIComponent(slug)}/pay`));
      }}
    />
  );
}

