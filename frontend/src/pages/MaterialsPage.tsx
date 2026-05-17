import React, { useEffect, useMemo, useState } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import { publicApi, LearningMaterial } from "../services/api";

type MaterialMeta = {
  stage: string;
  grade: string;
  grades: string[];
  subject: string;
  raw: string;
};

const PAGE_SIZE = 24;
const MATERIALS_HERO_DISMISSED_KEY = "materials_hero_dismissed_v1";
const FIXED_STAGE_OPTIONS = ["通用", "学前", "小学", "初中", "高中"] as const;
const STAGE_GRADE_RULES: Record<string, string[]> = {
  通用: ["通用"],
  学前: ["托班", "小班", "中班", "大班"],
  小学: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  初中: ["七年级", "八年级", "九年级"],
  高中: ["十年级", "十一年级", "十二年级"],
};

function splitTokens(value: string): string[] {
  return String(value || "")
    .split(/[|｜,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractLabelValue(input: string, label: string): string {
  const pattern = new RegExp(`${label}\\s*[:：]\\s*([^|｜,，;；\\n]+)`, "i");
  const matched = String(input || "").match(pattern);
  return matched ? matched[1].trim() : "";
}

function normalizeGrade(rawGrade: string): string {
  const raw = String(rawGrade || "").trim();
  if (!raw) return "";

  let value = raw
    .replace(/[（(].*?[）)]/g, "") // 去掉“下册”等补充描述
    .replace(/\s+/g, "");

  if (value === "通用") return "通用";

  const directMap: Record<string, string> = {
    托班: "托班",
    小班: "小班",
    中班: "中班",
    大班: "大班",
    "1年级": "一年级",
    "2年级": "二年级",
    "3年级": "三年级",
    "4年级": "四年级",
    "5年级": "五年级",
    "6年级": "六年级",
    "1级": "一年级",
    "2级": "二年级",
    "3级": "三年级",
    "4级": "四年级",
    "5级": "五年级",
    "6级": "六年级",
    "7年级": "七年级",
    "8年级": "八年级",
    "9年级": "九年级",
    "10年级": "十年级",
    "11年级": "十一年级",
    "12年级": "十二年级",
    "7级": "七年级",
    "8级": "八年级",
    "9级": "九年级",
    "10级": "十年级",
    "11级": "十一年级",
    "12级": "十二年级",
    "初1年级": "七年级",
    "初2年级": "八年级",
    "初3年级": "九年级",
    "高1年级": "十年级",
    "高2年级": "十一年级",
    "高3年级": "十二年级",
    "初一年级": "七年级",
    "初二年级": "八年级",
    "初三年级": "九年级",
    "高一年级": "十年级",
    "高二年级": "十一年级",
    "高三年级": "十二年级",
  };
  if (directMap[value]) return directMap[value];

  value = value.replace(/^([1-6])年级$/, (_, n) => `${"零一二三四五六"[Number(n)]}年级`);
  value = value.replace(/^([7-9])年级$/, (_, n) => `${"零一二三四五六七八九"[Number(n)]}年级`);
  value = value.replace(/^1([0-2])年级$/, (_, n) => (n === "0" ? "十年级" : n === "1" ? "十一年级" : "十二年级"));
  value = value.replace(/^初([1-3])年级$/, (_, n) => (n === "1" ? "七年级" : n === "2" ? "八年级" : "九年级"));
  value = value.replace(/^高([1-3])年级$/, (_, n) => (n === "1" ? "十年级" : n === "2" ? "十一年级" : "十二年级"));

  return value;
}

const GRADE_ORDER = [
  "通用",
  "托班",
  "小班",
  "中班",
  "大班",
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "十年级",
  "十一年级",
  "十二年级",
];

const GRADE_BY_NUM: Record<number, string> = {
  1: "一年级",
  2: "二年级",
  3: "三年级",
  4: "四年级",
  5: "五年级",
  6: "六年级",
  7: "七年级",
  8: "八年级",
  9: "九年级",
  10: "十年级",
  11: "十一年级",
  12: "十二年级",
};

function gradeToNum(raw: string): number {
  const text = String(raw || "").trim();
  const direct: Record<string, number> = {
    "一年级": 1,
    "二年级": 2,
    "三年级": 3,
    "四年级": 4,
    "五年级": 5,
    "六年级": 6,
    "七年级": 7,
    "八年级": 8,
    "九年级": 9,
    "十年级": 10,
    "十一年级": 11,
    "十二年级": 12,
  };
  if (direct[text]) return direct[text];
  const m = text.match(/^([1-9]|1[0-2])年级$/);
  if (m) return Number(m[1]);
  return 0;
}

function expandGradeValue(rawGrade: string): string[] {
  const raw = String(rawGrade || "").trim();
  if (!raw) return [];

  const normalized = normalizeGrade(raw);
  if (normalized === "通用") return ["通用"];
  if (normalized === "托班" || normalized === "小班" || normalized === "中班" || normalized === "大班") {
    return [normalized];
  }
  const n = gradeToNum(normalized);
  if (n > 0) return [GRADE_BY_NUM[n]];

  const compact = raw.replace(/\s+/g, "");
  if (compact === "低年级") return ["一年级", "二年级", "三年级"];

  const range = compact.match(/^([一二三四五六七八九十1-9]|1[0-2])\s*[-~～到至]\s*([一二三四五六七八九十1-9]|1[0-2])年级?$/);
  if (range) {
    const toNum = (token: string): number => {
      if (/^\d+$/.test(token)) return Number(token);
      const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      return map[token] || 0;
    };
    const start = toNum(range[1]);
    const end = toNum(range[2]);
    if (start > 0 && end > 0) {
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      const result: string[] = [];
      for (let i = from; i <= to; i += 1) {
        if (GRADE_BY_NUM[i]) result.push(GRADE_BY_NUM[i]);
      }
      if (result.length > 0) return result;
    }
  }

  const segments = splitTokens(raw);
  if (segments.length > 1) {
    const expanded = segments.flatMap((item) => expandGradeValue(item));
    return uniq(expanded);
  }
  return [];
}

function normalizeStage(rawStage: string): string {
  const value = String(rawStage || "").trim();
  if (!value) return "";
  if (value === "小学" || value === "初中" || value === "高中" || value === "通用") return value;
  if (/(幼儿|学前)/.test(value)) return "学前";
  return value;
}

function normalizeSubject(rawSubject: string): string {
  const value = String(rawSubject || "").trim();
  if (!value) return "";
  if (value === "期刊杂志") return "";
  if (/^语文(\s*[（(].*[）)])?$/.test(value)) return "语文";
  if (value === "数学/逻辑") return "数学";
  return value;
}

function parseMeta(description?: string): MaterialMeta {
  const raw = String(description || "").trim();
  if (!raw) return { stage: "", grade: "", grades: [], subject: "", raw: "" };

  const stage = normalizeStage(extractLabelValue(raw, "阶段"));
  const grades = expandGradeValue(extractLabelValue(raw, "年级"));
  const grade = grades[0] || "";
  const subject = normalizeSubject(extractLabelValue(raw, "学科"));
  if (stage || grade || subject) return { stage, grade, grades, subject, raw };

  const tokens = splitTokens(raw);
  const guessedStage = normalizeStage(tokens.find((token) => /(幼儿|小学|初中|高中|通用|学前)/.test(token)) || "");
  const guessedGrades = expandGradeValue(tokens.find((token) => /年级|级|低年级/.test(token)) || "");
  const guessedGrade = guessedGrades[0] || "";
  const guessedSubject = normalizeSubject(
    tokens.find((token) => /(语文|数学|英语|物理|化学|生物|历史|地理|政治|综合|科学)/.test(token)) || ""
  );
  return { stage: guessedStage, grade: guessedGrade, grades: guessedGrades, subject: guessedSubject, raw };
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isValidFacetValue(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "未标注") return false;
  return true;
}

function hostLabel(url?: string): string {
  try {
    const host = new URL(String(url || "")).hostname.replace(/^www\./, "");
    return host || "外部链接";
  } catch (_error) {
    return "外部链接";
  }
}

function gradeRank(value: string): number {
  const text = String(value || "");
  const idx = GRADE_ORDER.indexOf(text);
  return idx >= 0 ? idx : 999;
}

const MaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHero, setShowHero] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);


  useEffect(() => {
    try {
      setShowHero(window.localStorage.getItem(MATERIALS_HERO_DISMISSED_KEY) !== "1");
    } catch (_err) {
      setShowHero(true);
    }
  }, []);

  const dismissHero = () => {
    setShowHero(false);
    try {
      window.localStorage.setItem(MATERIALS_HERO_DISMISSED_KEY, "1");
    } catch (_err) {}
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getMaterials()
      .then((response) => {
        if (!alive) return;
        const next = Array.isArray(response.data) ? response.data : [];
        setMaterials(next);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "学习资料加载失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const enriched = useMemo(
    () =>
      materials.map((item) => {
        const meta = parseMeta(item.description);
        return { ...item, meta };
      }),
    [materials]
  );

  const optionBase = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    return enriched.filter((item) => {
      const byKeyword =
        !q ||
        `${item.title || ""} ${item.description || ""} ${item.category || ""}`.toLowerCase().includes(q);
      const bySubject = selectedSubjects.length === 0 || selectedSubjects.includes(item.meta.subject);
      return byKeyword && bySubject;
    });
  }, [enriched, keyword, selectedSubjects]);

  const stageOptions = useMemo(() => [...FIXED_STAGE_OPTIONS], []);

  const gradeOptions = useMemo(() => {
    const fromRules =
      selectedStages.length === 1
        ? STAGE_GRADE_RULES[selectedStages[0]] || []
        : FIXED_STAGE_OPTIONS.flatMap((stage) => STAGE_GRADE_RULES[stage] || []);
    const dataBacked = new Set(
      optionBase.flatMap((item) => item.meta.grades).filter((grade) => isValidFacetValue(grade))
    );
    // 保留固定规则顺序；同时允许显示数据里已有的对应规则值。
    return uniq(fromRules)
      .filter((grade) => dataBacked.has(grade) || selectedStages.length === 1)
      .sort((a, b) => {
        const diff = gradeRank(a) - gradeRank(b);
        return diff !== 0 ? diff : a.localeCompare(b, "zh-CN");
      });
  }, [optionBase, selectedStages]);
  const subjectOptions = useMemo(() => {
    const preferred = ["语文", "数学", "英语", "书法", "地理", "家庭教育", "综合", "科学/百科", "历史"];
    const values = uniq(enriched.map((item) => item.meta.subject).filter((item) => isValidFacetValue(item)));
    return values.sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
      return a.localeCompare(b, "zh-CN");
    });
  }, [enriched]);
  const filtered = useMemo(() => {
    return enriched.filter((item) => {
      const byStage = selectedStages.length === 0 || selectedStages.includes(item.meta.stage);
      const byGrade = selectedGrades.length === 0 || item.meta.grades.some((grade) => selectedGrades.includes(grade));
      const bySubject = selectedSubjects.length === 0 || selectedSubjects.includes(item.meta.subject);
      const byOptionBase = optionBase.includes(item);
      return byOptionBase && byStage && byGrade && bySubject;
    });
  }, [enriched, optionBase, selectedStages, selectedGrades, selectedSubjects]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [keyword, selectedStages, selectedGrades, selectedSubjects]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setSelectedGrades((prev) => prev.filter((item) => gradeOptions.includes(item)));
  }, [gradeOptions]);

  const clearFilters = () => {
    setKeyword("");
    setSelectedStages([]);
    setSelectedGrades([]);
    setSelectedSubjects([]);
  };

  const toggle = (value: string, selected: string[], setSelected: (next: string[]) => void) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((item) => item !== value));
      return;
    }
    setSelected([...selected, value]);
  };

  const handleStageToggle = (value: string) => {
    const nextStages = selectedStages.includes(value) ? [] : [value];
    setSelectedStages(nextStages);
    if (nextStages.length === 0) return;
    const allowedGrades = new Set<string>(STAGE_GRADE_RULES[nextStages[0]] || []);
    setSelectedGrades((prev) => prev.filter((item) => allowedGrades.has(item)));
  };

  const FilterGroup = ({
    title,
    options,
    selected,
    onToggle,
    limit = 999,
    expanded = true,
    onExpandToggle,
  }: {
    title: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
    limit?: number;
    expanded?: boolean;
    onExpandToggle?: () => void;
  }) => (
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      <div className="w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">{title}</div>
      <div className="flex-1">
        {options.length > limit ? (
          <div className="mb-2 flex items-center justify-end">
            <button type="button" onClick={onExpandToggle} className="text-xs font-bold text-[#8a6b45] hover:text-[#5e17eb]">
              {expanded ? "收起" : `展开 ${options.length - limit} 项`}
            </button>
          </div>
        ) : null}
      <div className="flex flex-wrap gap-2">
        {(expanded ? options : options.slice(0, limit)).map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={`${title}-${option}`}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                  : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb]"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* MaterialsPage: thin crisscross lines + slow drift orbs */}
      <style>{`
        @keyframes matOrb1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .5; }
          50% { transform: translate3d(-2%,1.5%,0) scale(1.15); opacity: .8; }
        }
        @keyframes matOrb2 {
          0%,100% { transform: translate3d(0,0,0) scale(1.05); opacity: .45; }
          40% { transform: translate3d(2.5%,-1%,0) scale(.9); opacity: .72; }
          85% { transform: translate3d(-1%,2%,0) scale(1.22); opacity: .85; }
        }
        @keyframes matOrb3 {
          0%,100% { transform: translate3d(0,0,0) scale(.92); opacity: .5; }
          55% { transform: translate3d(1.5%,-2.5%,0) scale(1.18); opacity: .78; }
        }
        @keyframes materialsToastIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(118,83,205,0.05)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(118,83,205,0.05)_1.5px,transparent_1.5px)] bg-[size:28px_28px]" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[8%] -right-20 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(129,75,255,0.13),transparent_62%)]" style={{ animation: "matOrb1 14s ease-in-out infinite" }} />
        <div className="absolute top-[55%] -left-28 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(153,102,255,0.1),transparent_58%)]" style={{ animation: "matOrb2 17s ease-in-out infinite 4s" }} />
        <div className="absolute -bottom-12 right-[15%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.12),transparent_55%)]" style={{ animation: "matOrb3 16s ease-in-out infinite 7s" }} />
      </div>
      <GlobalPublicNav
        compactMobile
        showExpertsEntry
        showProgramEntry
        showSearch={!showHero}
        searchPlaceholder="搜索资料名称、学科、关键词"
        searchValue={keyword}
        onSearchChange={setKeyword}
      />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        {showHero ? (
          <section className="group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_85%_15%,_rgba(143,100,255,0.1),_transparent_38%),linear-gradient(135deg,_#f4f1fd_0%,_#faf8ff_48%,_#f0ebff_100%)] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9">
            <button
              type="button"
              onClick={dismissHero}
              aria-label="关闭引导卡片"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#cfc2ee] bg-white/75 text-[#5b3fa1] opacity-0 transition hover:bg-white hover:text-[#4e36a0] group-hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 max-sm:opacity-100"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#5b3fa1]">
                Resource Hub
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2b1a3a] sm:text-5xl">
                学习资料
              </h1>
              <p className="mt-3 text-sm leading-7 text-[#6f62a3] sm:text-base">
                为家长整理可直接打开使用的学习资料。先按阶段和年级缩小范围，再按学科和资料类型精筛，能更快找到当下可用的内容。
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-[#d8d0ef] bg-white px-4 shadow-sm">
                <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索资料名称、学科、关键词"
                  className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                />
              </label>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#cfc2ee] bg-white px-5 text-sm font-bold text-[#654f88] transition hover:border-[#5e17eb] hover:text-[#5e17eb]"
            >
              清空筛选
            </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[1.8rem] border border-[#e0d9f2] bg-white p-5 shadow-[0_16px_50px_rgba(80,62,125,0.06)] sm:p-6">
          <div className="space-y-5">
            <FilterGroup
              title="阶段"
              options={stageOptions}
              selected={selectedStages}
              onToggle={handleStageToggle}
            />
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">年级</div>
              <div className="flex-1">
                <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
                  <div className="flex min-w-max flex-nowrap gap-2">
                  {gradeOptions.map((option) => {
                    const active = selectedGrades.includes(option);
                    return (
                      <button
                        key={`年级-${option}`}
                        type="button"
                        onClick={() => toggle(option, selectedGrades, setSelectedGrades)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                          active
                            ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                            : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb]"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
            <FilterGroup
              title="科目"
              options={subjectOptions}
              selected={selectedSubjects}
              onToggle={(value) => toggle(value, selectedSubjects, setSelectedSubjects)}
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[#7b6bb8]">共 {filtered.length} 条资料</span>
            {selectedStages.map((item) => (
              <span key={`stage-${item}`} className="rounded-full bg-[#f3eefc] px-2.5 py-1 text-xs font-bold text-[#8a5d26]">
                阶段: {item}
              </span>
            ))}
            {selectedGrades.map((item) => (
              <span key={`grade-${item}`} className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#3e4d88]">
                年级: {item}
              </span>
            ))}
            {selectedSubjects.map((item) => (
              <span key={`subject-${item}`} className="rounded-full bg-[#eefcf4] px-2.5 py-1 text-xs font-bold text-[#1f6a47]">
                科目: {item}
              </span>
            ))}
          </div>
        </section>

        {error ? <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div> : null}

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading
            ? Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-[1.4rem] border border-[#e2dcf0] bg-white p-5">
                  <div className="h-6 w-4/5 rounded bg-[#ece3f7]" />
                  <div className="mt-3 h-4 w-2/5 rounded bg-[#ece3f7]" />
                  <div className="mt-4 h-16 rounded bg-[#ece3f7]" />
                  <div className="mt-4 h-10 rounded bg-[#ece3f7]" />
                </div>
              ))
            : null}
          {!loading && paged.length === 0 ? (
            <div className="col-span-full rounded-[1.6rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center">
              <p className="text-base font-bold text-[#6f5fb4]">没有匹配到资料</p>
              <p className="mt-2 text-sm text-[#8b7db6]">可以尝试减少筛选条件，或点击“清空筛选”重新查看全部。</p>
            </div>
          ) : null}
          {!loading
            ? paged.map((item) => (
                <article
                  key={item._id}
                  className="group rounded-[1.4rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)] transition hover:-translate-y-1 hover:border-[#d7b184] hover:shadow-[0_18px_55px_rgba(95,56,22,0.1)] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const now = Date.now();
                    if ((window as any).__materialsToastAt && now - (window as any).__materialsToastAt < 2500) return;
                    (window as any).__materialsToastAt = now;
                    navigator.clipboard.writeText(item.fileUrl || "").catch(() => {});
                    let el = document.getElementById("materials-toast");
                    if (el) el.remove();
                    el = document.createElement("div");
                    el.id = "materials-toast";
                    el.className = "fixed left-1/2 top-5 z-[9999] -translate-x-1/2 rounded-full bg-[#2b1a3a] px-6 py-2.5 text-sm font-bold text-white shadow-lg";
                    el.style.cssText = "animation:materialsToastIn .3s ease-out";
                    el.textContent = "已复制链接";
                    document.body.appendChild(el);
                    setTimeout(() => { el.remove(); (window as any).__materialsToastAt = 0; }, 2000);
                  }}
                >
                  <h2 className="line-clamp-2 text-lg font-black leading-snug text-[#2b1a3a]">{item.title}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.meta.stage ? (
                      <span className="rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-2.5 py-1 text-[11px] font-bold text-[#5e17eb]">
                        {item.meta.stage}
                      </span>
                    ) : null}
                    {item.meta.grade ? (
                      <span className="rounded-full border border-[#d9d8ee] bg-[#f7f7ff] px-2.5 py-1 text-[11px] font-bold text-[#4e4c87]">
                        {item.meta.grade}
                      </span>
                    ) : null}
                    {item.meta.subject ? (
                      <span className="rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
                        {item.meta.subject}
                      </span>
                    ) : null}
                    {item.category ? (
                      <span className="rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-2.5 py-1 text-[11px] font-bold text-[#8a3daa]">
                        {item.category}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#6f62a4]">{item.meta.raw || "暂无描述"}</p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-bold uppercase tracking-[0.14em] text-[#9b8ac6]">
                      {hostLabel(item.fileUrl)}
                    </span>
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-[#5e17eb] px-4 py-2 text-xs font-black !text-white transition hover:bg-[#4c12c3] hover:!text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      打开资料
                      <span className="material-symbols-outlined !text-[15px] !font-light !text-white">open_in_new</span>
                    </a>
                  </div>
                </article>
              ))
            : null}
        </section>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </main>
    </div>
  );
};

export default MaterialsPage;
