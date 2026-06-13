function normalizeFailureMessage(message: unknown): string {
  return typeof message === "string" ? message.trim().toLowerCase() : "";
}

export function isTransientAiGenerationFailure(message: unknown): boolean {
  const lowerMessage = normalizeFailureMessage(message);
  if (!lowerMessage) return false;
  return [
    "fetch failed",
    "failed to fetch",
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "socket hang up",
    "network",
    "http 5",
    "timeout",
    "timed out",
    "超时",
    "gateway",
    "upstream",
    "not granted",
    "服务不可用",
  ].some((token) => lowerMessage.includes(token));
}
