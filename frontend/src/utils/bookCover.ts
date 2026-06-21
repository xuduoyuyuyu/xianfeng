type BookCoverSource = {
  coverImage?: string;
};

type BookMetadataCoverSource = {
  cover?: string;
} | null | undefined;

export function hasUsableBookCover(url: unknown): boolean {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.includes("via.placeholder.com")) return false;
  if (value.includes("placeholder")) return false;
  if (value.includes("/uploads/images/")) return false;
  return true;
}

export function normalizeBookCoverUrl(url: unknown): string {
  const value = String(url || "").trim();
  if (!hasUsableBookCover(value)) return "";
  if (!/(cdn\.weread\.qq\.com|rescdn\.qqmail\.com|wfqqreader-\d+\.image\.myqcloud\.com)\/(weread\/)?cover\//i.test(value)) {
    return value;
  }
  return value.replace(/\/(?:s|m|b)_([^/?#]+)(?=([?#]|$))/i, "/t7_$1");
}

export function buildBookCoverImageSrc(url: unknown): string {
  const normalized = normalizeBookCoverUrl(url);
  return `/api/books/proxy-image?url=${encodeURIComponent(normalized.replace(/^http:\/\//i, "https://"))}`;
}

export function getPreferredBookCover(book: BookCoverSource, metadata: BookMetadataCoverSource): string {
  const metadataCover = normalizeBookCoverUrl(metadata?.cover);
  if (metadataCover) return metadataCover;
  return normalizeBookCoverUrl(book.coverImage);
}
