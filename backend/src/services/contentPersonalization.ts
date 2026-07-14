export type ContentProfileStage = "学前" | "小学" | "初中" | "高中";

export type ContentProfile = {
  city: string;
  region: string;
  grade: string;
  stage: ContentProfileStage;
};

function clean(value: unknown, maxLength = 80): string {
  if (Array.isArray(value)) value = value[0];
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length <= maxLength ? text : "";
}

export function profileStage(grade: unknown): ContentProfileStage | "" {
  const text = clean(grade);
  if (text.includes("学前") || /未入园|托班|小班|中班|大班/.test(text)) return "学前";
  if (text.includes("小学")) return "小学";
  if (text.includes("初中") || text.includes("预初")) return "初中";
  if (text.includes("高中") || /^高[一二三]/.test(text)) return "高中";
  return "";
}

export function parseContentProfile(query: Record<string, unknown>): ContentProfile | null {
  const city = clean(query.profileCity);
  const region = clean(query.profileRegion);
  const grade = clean(query.profileGrade);
  const stage = profileStage(grade);
  return city && region && grade && stage ? { city, region, grade, stage } : null;
}

function normalizedText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizedText).join(" ").toLowerCase();
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizedText).join(" ").toLowerCase();
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function scorePersonalizedText(value: unknown, profile: ContentProfile): number {
  const text = normalizedText(value);
  if (!text) return 0;
  let score = 0;
  if (text.includes(profile.region.toLowerCase())) score += 1000;
  if (text.includes(profile.city.toLowerCase())) score += 100;
  if (text.includes(profile.grade.toLowerCase())) score += 10;
  if (text.includes(profile.stage.toLowerCase())) score += 1;
  return score;
}

export function rankPersonalizedItems<T>(
  items: T[],
  profile: ContentProfile | null,
  textOf: (item: T) => unknown
): T[] {
  if (!profile) return items;
  return items
    .map((item, index) => ({ item, index, score: scorePersonalizedText(textOf(item), profile) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}
