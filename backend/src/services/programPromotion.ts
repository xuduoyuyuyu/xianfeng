export const PROGRAM_PROMOTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isProgramInPromotionWindow(
  program: { publishedAt?: unknown; createdAt?: unknown } | null | undefined,
  now = Date.now(),
): boolean {
  const value = program?.publishedAt || program?.createdAt;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return age >= 0 && age < PROGRAM_PROMOTION_WINDOW_MS;
}
