/** Safe in-app path for closing info pages (open-redirect safe). */
export function sanitizeReturnPath(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw !== "string" || raw.trim() === "") return "/";
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  if (s === "/") return "/";
  if (/^\/s\/[^/]+$/.test(s)) return s;
  return "/";
}

/** From a pathname like `/s/center/cart`, returns `/s/center` for menu links. */
export function menuPathFromLocation(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/s\/([^/]+)/);
  return m ? `/s/${m[1]}` : null;
}
