export type ContentProfileStage = "学前" | "小学" | "初中" | "高中";

export type ContentProfile = {
  city: string;
  region: string;
  grade: string;
  stage: ContentProfileStage;
};

export type PersonalizedContentFields = {
  structured?: unknown;
  tags?: unknown;
  title?: unknown;
  body?: unknown;
  publishedAt?: unknown;
};

type ProfileFieldLayer = "structured" | "tags" | "title" | "body";

const PROFILE_FIELD_WEIGHTS = {
  structured: { region: 2400, city: 900, exactGrade: 720, adjacentGrade: 260, stage: 120 },
  tags: { region: 1600, city: 600, exactGrade: 480, adjacentGrade: 180, stage: 90 },
  title: { region: 1200, city: 450, exactGrade: 360, adjacentGrade: 140, stage: 70 },
  body: { region: 600, city: 220, exactGrade: 180, adjacentGrade: 70, stage: 35 },
} as const;

const FIVE_FOUR_CITIES = ["上海", "威海", "淄博", "莱芜", "烟台", "哈尔滨", "大庆", "青岛"];
const CHINESE_GRADE_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

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

export function normalizeProfilePlace(value: unknown, type: "city" | "region"): string {
  const text = clean(value).toLowerCase();
  if (text.length < 3) return text;
  const suffix = type === "city" ? /市$/u : /[区县市]$/u;
  const stripped = text.replace(suffix, "");
  return stripped.length >= 2 ? stripped : text;
}

function usesFiveFourSchoolSystem(city: unknown): boolean {
  const normalized = normalizeProfilePlace(city, "city");
  return FIVE_FOUR_CITIES.some((item) => normalized.includes(item));
}

function gradeSequence(stage: ContentProfileStage, city: unknown): string[] {
  if (stage === "学前") return ["学前未入园", "学前托班", "学前小班", "学前中班", "学前大班"];
  if (stage === "小学") {
    const last = usesFiveFourSchoolSystem(city) ? 5 : 6;
    return CHINESE_GRADE_NUMBERS.slice(0, last).map((number) => `小学${number}年级`);
  }
  if (stage === "初中") {
    const first = usesFiveFourSchoolSystem(city) ? 6 : 7;
    return CHINESE_GRADE_NUMBERS.slice(first - 1, 9).map((number) => `初中${number}年级`);
  }
  return ["高一年级", "高二年级", "高三年级"];
}

function normalizeGrade(value: unknown): string {
  return clean(value).replace("六年级（预初）", "六年级");
}

export function adjacentProfileGrades(grade: unknown, city: unknown): string[] {
  const normalizedGrade = normalizeGrade(grade);
  const stage = profileStage(normalizedGrade);
  if (!stage) return [];
  const sequence = gradeSequence(stage, city);
  const index = sequence.indexOf(normalizedGrade);
  if (index < 0) return [];
  return [sequence[index - 1], sequence[index + 1]].filter((item): item is string => Boolean(item));
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

function flattenLayer(value: unknown): string {
  return normalizedText(value);
}

function placePhrases(value: unknown, type: "city" | "region"): string[] {
  const original = clean(value).toLowerCase();
  const normalized = normalizeProfilePlace(value, type);
  return [...new Set([original, normalized])].filter((item) => item.length >= 2);
}

function gradePhrases(value: unknown): string[] {
  const grade = normalizeGrade(value).toLowerCase();
  if (!grade) return [];
  const bare = grade.replace(/^(学前|小学|初中)/u, "");
  return [...new Set([grade, bare])].filter((item) => item.length >= 2);
}

function includesPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function scoreLayer(text: string, layer: ProfileFieldLayer, profile: ContentProfile): number {
  if (!text) return 0;
  const weights = PROFILE_FIELD_WEIGHTS[layer];
  let score = 0;
  if (includesPhrase(text, placePhrases(profile.region, "region"))) score += weights.region;
  if (includesPhrase(text, placePhrases(profile.city, "city"))) score += weights.city;

  const exactGradeMatched = includesPhrase(text, gradePhrases(profile.grade));
  if (exactGradeMatched) {
    score += weights.exactGrade;
  } else {
    const adjacent = adjacentProfileGrades(profile.grade, profile.city).flatMap(gradePhrases);
    if (includesPhrase(text, adjacent)) score += weights.adjacentGrade;
  }
  if (text.includes(profile.stage.toLowerCase())) score += weights.stage;
  return score;
}

export function scorePersonalizedContent(fields: PersonalizedContentFields, profile: ContentProfile): number {
  return (Object.keys(PROFILE_FIELD_WEIGHTS) as ProfileFieldLayer[])
    .reduce((score, layer) => score + scoreLayer(flattenLayer(fields[layer]), layer, profile), 0);
}

function timestamp(value: unknown): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rankPersonalizedContent<T>(
  items: T[],
  profile: ContentProfile | null,
  fieldsOf: (item: T) => PersonalizedContentFields,
  options: { preserveOriginalTieOrder?: boolean } = {},
): T[] {
  if (!profile) return items;
  return items
    .map((item, index) => {
      const fields = fieldsOf(item);
      return { item, index, fields, score: scorePersonalizedContent(fields, profile) };
    })
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) return scoreDiff;
      if (left.score > 0 && !options.preserveOriginalTieOrder) {
        const leftTime = timestamp(left.fields.publishedAt);
        const rightTime = timestamp(right.fields.publishedAt);
        if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
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
