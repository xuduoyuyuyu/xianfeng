const LOGIN_INVITE_COOKIE = "xf_login_invite";
const LOGIN_INVITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function readCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  for (const item of document.cookie.split(";")) {
    const trimmed = item.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return "";
}

export function readLoginInviteCookie(): string {
  const raw = readCookieValue(LOGIN_INVITE_COOKIE);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return "";
  }
}

export function writeLoginInviteCookie(inviteCode: string): void {
  if (typeof document === "undefined") return;
  const normalized = inviteCode.trim();
  if (!normalized) return;
  document.cookie = `${LOGIN_INVITE_COOKIE}=${encodeURIComponent(normalized)}; Max-Age=${LOGIN_INVITE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function clearLoginInviteCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOGIN_INVITE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
