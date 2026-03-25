import { getStoreMenu } from "@/lib/api";
import { StoreMenuClient } from "@/components/StoreMenuClient";

export default async function StoreMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const menu = await getStoreMenu(slug, t);
  return <StoreMenuClient slug={slug} menu={menu} />;
}

