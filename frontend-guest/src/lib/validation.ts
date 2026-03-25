export function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (v.length < 3) return false;
  if (v.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

