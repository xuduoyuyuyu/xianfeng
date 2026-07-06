import type { ExternalBookLibraryRecord } from "../services/api";

const EXTERNAL_BOOK_LIBRARY_STORAGE_PREFIX = "xf_external_book_library:";
const EXTERNAL_BOOK_LIBRARY_RECORDS_KEY = "xf_external_book_library:records";

function getExternalBookLibraryStorageKey(id: string): string {
  return `${EXTERNAL_BOOK_LIBRARY_STORAGE_PREFIX}${id}`;
}

export function rememberExternalBookLibraryRecord(item: ExternalBookLibraryRecord): void {
  if (typeof window === "undefined" || !item?.id) return;

  try {
    window.sessionStorage.setItem(getExternalBookLibraryStorageKey(item.id), JSON.stringify(item));
  } catch {
    // Detail navigation still works; direct refresh just falls back to the list.
  }
}

export function rememberExternalBookLibraryRecords(items: ExternalBookLibraryRecord[]): void {
  if (typeof window === "undefined") return;

  try {
    const records = items.filter((item) => item?.id);
    window.sessionStorage.setItem(EXTERNAL_BOOK_LIBRARY_RECORDS_KEY, JSON.stringify(records));
    records.forEach((item) => rememberExternalBookLibraryRecord(item));
  } catch {
    // Related-book suggestions are optional; detail navigation can still use the clicked record.
  }
}

export function readExternalBookLibraryRecord(id: string): ExternalBookLibraryRecord | null {
  if (typeof window === "undefined" || !id) return null;

  try {
    const raw = window.sessionStorage.getItem(getExternalBookLibraryStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ExternalBookLibraryRecord;
  } catch {
    return null;
  }
}

export function readExternalBookLibraryRecords(): ExternalBookLibraryRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(EXTERNAL_BOOK_LIBRARY_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object" && item.id) as ExternalBookLibraryRecord[];
  } catch {
    return [];
  }
}
