export type ProRequiredDetail = {
  featureKey?: string;
  upgradeUrl?: string;
  message?: string;
};

export function isProBillingEnabled(): boolean {
  return import.meta.env.VITE_PRO_BILLING_ENABLED === "true";
}

function readStoredRole(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return "";
    const parsed = JSON.parse(value);
    return typeof parsed?.role === "string" ? parsed.role : "";
  } catch {
    return "";
  }
}

export function hasAdminBypass(): boolean {
  if (typeof window === "undefined") return false;
  const userToken = window.localStorage.getItem("token");
  const userRole = readStoredRole("user");
  if (userToken && userRole !== "admin") return false;
  return Boolean(window.localStorage.getItem("admin_token")) || readStoredRole("admin_user") === "admin" || userRole === "admin";
}

export function getAdminOrUserToken(): string {
  if (typeof window === "undefined") return "";
  const userToken = window.localStorage.getItem("token");
  const adminToken = window.localStorage.getItem("admin_token");
  return (userToken || adminToken || "").trim();
}

export function hasAdminOrUserSession(): boolean {
  return hasAdminBypass() || Boolean(getAdminOrUserToken());
}

export function showProUpgrade(detail: ProRequiredDetail = {}) {
  if (!isProBillingEnabled()) return;
  if (hasAdminBypass()) return;
  document.dispatchEvent(
    new CustomEvent("xf-show-pro-modal", {
      detail: {
        featureKey: detail.featureKey || "",
        upgradeUrl: detail.upgradeUrl || "/pro",
        message: detail.message || "该功能需要订阅后使用",
      },
    })
  );
}

export function isProRequiredPayload(value: any): boolean {
  return isProBillingEnabled() && !hasAdminBypass() && value?.code === "PRO_REQUIRED";
}

export function isProRequiredError(error: any): boolean {
  if (!isProBillingEnabled()) return false;
  if (hasAdminBypass()) return false;
  return error?.response?.status === 402 || isProRequiredPayload(error?.response?.data);
}

export function showProUpgradeFromPayload(value: any) {
  if (!isProBillingEnabled()) return;
  if (hasAdminBypass()) return;
  showProUpgrade({
    featureKey: value?.featureKey,
    upgradeUrl: value?.upgradeUrl,
    message: value?.message,
  });
}
