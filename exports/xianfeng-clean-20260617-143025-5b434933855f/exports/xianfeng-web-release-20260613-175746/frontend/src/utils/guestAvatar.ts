export const GUEST_FALLBACK_AVATAR_SRC = "/assets/wel-avatar/optimized/no-hat.webp";

export const GUEST_FALLBACK_AVATAR_MARKERS = [
  "/assets/wel-avatar/no-hat.png",
  "/assets/wel-avatar/optimized/no-hat.webp",
  "1779668991727-vzxkyx0x.png",
  "1780579648191-wkisaaid.png",
];

export const GUEST_FALLBACK_AVATAR_FRAME_CLASS = "bg-white";
export const GUEST_REAL_AVATAR_FRAME_CLASS = "bg-[#e8e8f9]";

export const GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS = "h-[86%] w-[86%] rounded-[1.1rem] object-contain object-center";
export const GUEST_REAL_AVATAR_DETAIL_IMG_CLASS = "h-full w-full rounded-[1.35rem] object-cover object-center";

export const GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS = "h-[86%] w-[86%] rounded-[1rem] object-contain object-center";
export const GUEST_REAL_AVATAR_CARD_IMG_CLASS = "h-full w-full rounded-[1.25rem] object-cover object-center";

export const GUEST_FALLBACK_AVATAR_ARCHIVE_IMG_CLASS = "h-56 w-full object-contain object-center p-3 transition duration-700 group-hover:scale-105";
export const GUEST_REAL_AVATAR_ARCHIVE_IMG_CLASS = "h-56 w-full object-cover object-center transition duration-700 group-hover:scale-105";

const XIANFENG_UPLOAD_HOST_RE = /^https?:\/\/xianfeng\.xinzhi\.info\/uploads\/images\/([^?#]+)([?#].*)?$/i;
const LOCAL_DEV_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function shouldUseLocalUploadProxy(): boolean {
  if (typeof window === "undefined") return false;
  return LOCAL_DEV_HOST_RE.test(window.location.hostname);
}

export function normalizeGuestAvatar(url?: string): string {
  const clean = String(url || "").trim();
  const uploadMatch = clean.match(XIANFENG_UPLOAD_HOST_RE);
  if (uploadMatch && shouldUseLocalUploadProxy()) {
    const fileName = uploadMatch[1] || "";
    const suffix = uploadMatch[2] || "";
    return `/uploads/images/${fileName}${suffix}`;
  }
  return clean.replace(/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?\//i, (_match, host, port) => `http://${host}${port ? `:${port}` : ""}/`);
}

export function isXiaowanziFallbackAvatar(url?: string): boolean {
  const clean = String(url || "").trim();
  return GUEST_FALLBACK_AVATAR_MARKERS.some((marker) => clean.includes(marker));
}

export function resolveGuestAvatar(url?: string, fallbackActive = false) {
  const rawAvatar = normalizeGuestAvatar(url);
  const isFallback = !rawAvatar || fallbackActive || isXiaowanziFallbackAvatar(rawAvatar);
  return {
    isFallback,
    src: isFallback ? GUEST_FALLBACK_AVATAR_SRC : rawAvatar,
  };
}
