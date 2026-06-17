const MAX_CHILD_PROFILES = 12;
const MAX_BROWSING_MEMORY = 40;
const MAX_CONVERSATION_SESSIONS = 40;
const MAX_MESSAGES_PER_SESSION = 120;
const MAX_TEXT = 1200;

export type XiaowanziSyncState = {
  childProfiles: any[];
  childProfileDeletions: any[];
  chatContext: any | null;
  browsingMemory: any[];
  conversationSessions: any[];
  conversationMessages: Record<string, any[]>;
};

export function emptyXiaowanziSyncState(): XiaowanziSyncState {
  return {
    childProfiles: [],
    childProfileDeletions: [],
    chatContext: null,
    browsingMemory: [],
    conversationSessions: [],
    conversationMessages: {},
  };
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function cleanText(value: unknown, limit = MAX_TEXT): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function validDate(value: unknown): string {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function dateTime(value: unknown): number {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function latestByKey<T>(items: T[], keyOf: (item: T) => string, timeOf: (item: T) => unknown, limit: number): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    const current = map.get(key);
    if (!current || dateTime(timeOf(item)) >= dateTime(timeOf(current))) map.set(key, item);
  });
  return Array.from(map.values())
    .sort((a, b) => dateTime(timeOf(b)) - dateTime(timeOf(a)))
    .slice(0, limit);
}

function pruneDeletedChildProfiles(childProfiles: any[], deletions: any[]): any[] {
  const deletedAtById = new Map<string, number>();
  deletions.forEach((item) => {
    const id = cleanText(item?.id, 80);
    if (!id) return;
    deletedAtById.set(id, dateTime(item?.removedAt));
  });
  return childProfiles.filter((item) => {
    const removedAt = deletedAtById.get(item.id);
    return typeof removedAt !== "number" || removedAt < dateTime(item.createdAt);
  });
}

export function sanitizeXiaowanziSyncState(input: Partial<XiaowanziSyncState> | null | undefined): XiaowanziSyncState {
  const raw = input || {};

  const childProfileDeletions = latestByKey(
    asArray(raw.childProfileDeletions)
      .map((item) => ({
        id: cleanText((item as any)?.id, 80),
        removedAt: validDate((item as any)?.removedAt),
      }))
      .filter((item) => item.id),
    (item) => item.id,
    (item) => item.removedAt,
    MAX_CHILD_PROFILES
  );

  const childProfiles = pruneDeletedChildProfiles(latestByKey(
    asArray(raw.childProfiles)
      .map((item) => ({
        ...asRecord(item),
        id: cleanText((item as any)?.id, 80),
        relation: cleanText((item as any)?.relation, 40),
        displayName: cleanText((item as any)?.displayName, 80),
        gender: (item as any)?.gender === "男" ? "男" : "女",
        birthDate: cleanText((item as any)?.birthDate, 40),
        city: cleanText((item as any)?.city, 80),
        region: cleanText((item as any)?.region, 80),
        grade: cleanText((item as any)?.grade, 80),
        concernTags: asArray((item as any)?.concernTags).map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 12),
        avatar: cleanText((item as any)?.avatar, 500),
        createdAt: validDate((item as any)?.createdAt),
      }))
      .filter((item) => item.id),
    (item) => item.id,
    (item) => item.createdAt,
    MAX_CHILD_PROFILES
  ), childProfileDeletions);

  const chatContextRaw = asRecord(raw.chatContext);
  const chatContextCandidate = cleanText(chatContextRaw.sessionId, 120) || cleanText(chatContextRaw.childProfileId, 80)
    ? {
        sessionId: cleanText(chatContextRaw.sessionId, 120),
        childProfileId: cleanText(chatContextRaw.childProfileId, 80),
        isChildBound: Boolean(chatContextRaw.isChildBound),
        lastSwitchedAt: validDate(chatContextRaw.lastSwitchedAt),
      }
    : null;
  const chatContext = chatContextCandidate?.childProfileId && !childProfiles.some((item) => item.id === chatContextCandidate.childProfileId)
    ? null
    : chatContextCandidate;

  const browsingMemory = latestByKey(
    asArray(raw.browsingMemory)
      .map((item) => ({
        pathname: cleanText((item as any)?.pathname, 240),
        label: cleanText((item as any)?.label, 120),
        summary: cleanText((item as any)?.summary, 600),
        visitedAt: validDate((item as any)?.visitedAt),
      }))
      .filter((item) => item.pathname),
    (item) => item.pathname,
    (item) => item.visitedAt,
    MAX_BROWSING_MEMORY
  );

  const conversationSessions = latestByKey(
    asArray(raw.conversationSessions)
      .map((item) => ({
        id: cleanText((item as any)?.id, 120),
        title: cleanText((item as any)?.title, 120) || "历史会话",
        childId: cleanText((item as any)?.childId, 80) || null,
        childName: cleanText((item as any)?.childName, 80),
        createdAt: validDate((item as any)?.createdAt),
        updatedAt: validDate((item as any)?.updatedAt || (item as any)?.createdAt),
        messageCount: Math.max(0, Math.min(120, Number((item as any)?.messageCount) || 0)),
        lastMessage: cleanText((item as any)?.lastMessage, 240),
      }))
      .filter((item) => item.id),
    (item) => item.id,
    (item) => item.updatedAt,
    MAX_CONVERSATION_SESSIONS
  );

  const sessionIds = new Set(conversationSessions.map((session) => session.id));
  const rawMessages = asRecord(raw.conversationMessages);
  const conversationMessages: Record<string, any[]> = {};
  Object.keys(rawMessages).forEach((sessionId) => {
    const safeSessionId = cleanText(sessionId, 120);
    if (!safeSessionId || !sessionIds.has(safeSessionId)) return;
    conversationMessages[safeSessionId] = asArray(rawMessages[sessionId])
      .map((message) => ({
        role: (message as any)?.role === "user" ? "user" : "assistant",
        content: cleanText((message as any)?.content, MAX_TEXT),
        ts: cleanText((message as any)?.ts, 80) || undefined,
      }))
      .filter((message) => message.content)
      .slice(-MAX_MESSAGES_PER_SESSION);
  });

  return {
    childProfiles,
    childProfileDeletions,
    chatContext,
    browsingMemory,
    conversationSessions,
    conversationMessages,
  };
}

export function mergeXiaowanziSyncState(
  current: Partial<XiaowanziSyncState> | null | undefined,
  incoming: Partial<XiaowanziSyncState> | null | undefined
): XiaowanziSyncState {
  const left = sanitizeXiaowanziSyncState(current);
  const right = sanitizeXiaowanziSyncState(incoming);
  const conversationSessions = latestByKey(
    [...left.conversationSessions, ...right.conversationSessions],
    (item) => item.id,
    (item) => item.updatedAt,
    MAX_CONVERSATION_SESSIONS
  );
  const sessionIds = new Set(conversationSessions.map((session) => session.id));
  const conversationMessages: Record<string, any[]> = {};
  [...Object.entries(left.conversationMessages), ...Object.entries(right.conversationMessages)].forEach(([sessionId, messages]) => {
    if (!sessionIds.has(sessionId)) return;
    conversationMessages[sessionId] = asArray(messages).slice(-MAX_MESSAGES_PER_SESSION);
  });

  return sanitizeXiaowanziSyncState({
    childProfiles: [...left.childProfiles, ...right.childProfiles],
    childProfileDeletions: [...left.childProfileDeletions, ...right.childProfileDeletions],
    chatContext: dateTime(right.chatContext?.lastSwitchedAt) >= dateTime(left.chatContext?.lastSwitchedAt) ? right.chatContext : left.chatContext,
    browsingMemory: [...left.browsingMemory, ...right.browsingMemory],
    conversationSessions,
    conversationMessages,
  });
}
