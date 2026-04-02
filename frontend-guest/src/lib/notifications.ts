/**
 * Web Notifications (браузерные уведомления).
 * - Нужен HTTPS (или localhost).
 * - requestPermission() надёжно работает из обработчика клика, не из useEffect/таймера.
 * - Safari iOS: ограничения; часто только в установленной PWA на домашний экран.
 */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Вызывать из onClick (user gesture). */
export async function requestNotificationPermissionFromUser(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

type OrderLineForNotification = {
  name: string;
  quantity: number;
  modifiers: Array<{ name: string; price_delta_cents: number }>;
};

function formatReadyLine(line: OrderLineForNotification): string {
  const mods = line.modifiers?.length ? ` (${line.modifiers.map((m) => m.name).join(", ")})` : "";
  return `${line.quantity}× ${line.name}${mods}`;
}

export function notifyOrderReady(publicNumber: number | null, lines: OrderLineForNotification[]): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const preview = lines?.length
      ? lines.slice(0, 3).map(formatReadyLine).join("; ")
      : "";

    new Notification("Заказ готов", {
      body:
        publicNumber != null
          ? `Номер: ${publicNumber}${preview ? `\n${preview}` : ""}`
          : preview
            ? preview
            : "Можно забирать на столе выдачи.",
      tag: `order-ready-${publicNumber ?? "na"}`,
    });
  } catch {
    /* ignore */
  }
}
