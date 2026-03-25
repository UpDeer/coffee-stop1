import { getStoreMenu } from "@/lib/api";
import { ItemCustomizeModalPageClient } from "@/components/ItemCustomizeModalPageClient";
import type { MenuItem, StoreMenu } from "@/lib/types";

function findItem(menu: StoreMenu, menuItemId: string): MenuItem | null {
  for (const c of menu.categories) {
    for (const it of c.items) {
      if (it.id === menuItemId) return it;
    }
  }
  return null;
}

export default async function ItemCustomizePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; menuItemId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug, menuItemId } = await params;
  const { t } = await searchParams;
  const menu = await getStoreMenu(slug, t);
  const item = findItem(menu, menuItemId);
  if (!item) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <main className="mx-auto max-w-xl px-4 py-10">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Позиция не найдена.</div>
        </main>
      </div>
    );
  }

  return (
    <ItemCustomizeModalPageClient slug={slug} item={item} />
  );
}

