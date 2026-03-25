import { OrderStatusClient } from "@/components/OrderStatusClient";

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;

  return <OrderStatusClient slug={slug} orderId={orderId} key={orderId} />;
}

