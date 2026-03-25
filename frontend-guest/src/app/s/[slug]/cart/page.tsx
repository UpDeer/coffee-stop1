import { getStoreMenu } from "@/lib/api";
import { CartClient } from "@/components/CartClient";

export default async function CartPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const menu = await getStoreMenu(slug, t);
  return <CartClient slug={slug} menu={menu} />;
}

