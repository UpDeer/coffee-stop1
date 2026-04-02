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

export function notifyOrderReady(publicNumber: number | null): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification("Заказ готов", {
      body:
        publicNumber != null
          ? `Номер: ${publicNumber}`
          : "Можно забирать на столе выдачи.",
      tag: `order-ready-${publicNumber ?? "na"}`,
    });
  } catch {
    /* ignore */
  }
}
