"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransientAiGenerationFailure = isTransientAiGenerationFailure;
function normalizeFailureMessage(message) {
    return typeof message === "string" ? message.trim().toLowerCase() : "";
}
function isTransientAiGenerationFailure(message) {
    const lowerMessage = normalizeFailureMessage(message);
    if (!lowerMessage)
        return false;
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
