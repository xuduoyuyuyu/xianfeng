import mongoose from "mongoose";
import Program from "../models/Program";
import EducationDictionaryEntry from "../models/EducationDictionaryEntry";

type RawGlossaryItem = {
  term?: unknown;
  definition?: unknown;
  sourceUrl?: unknown;
  aliases?: unknown;
};

type DictionaryEntryInput = {
  term: string;
  normalizedTerm: string;
  definition: string;
  sourceUrl: string;
  aliases: string[];
};

type SyncDictionaryOptions = {
  sourceText?: string;
};

const CHINESE_SENTENCE_NEGATIVE_PATTERN =
  /(包括|但是|不过|因为|所以|如果|那么|然后|事实上|大多数人|不具备|并不构成|这个能力|这种能力|这个问题|这个事情|这件事|这个内容|发现我|我们|你们|他们|她们|很有|觉得|认为|可以通过|家庭访谈的这种能力)/;
const CLAUSE_LEADING_NEGATIVE_PATTERN =
  /^(?:的|个|或者|如果|但是|不过|因为|所以|然后|并且|而且|以及|还有|关于|对于|不是|不可能|可能|那么|这是|那是|果他)/;
const GENERIC_NEGATIVE_TERMS = new Set([
  "工作方法",
  "我学心理",
  "发现我很有家庭访谈的这种能力",
]);
const ENGLISH_ALLOWED_TERMS = new Set([
  "AI",
  "AIGC",
  "GPT",
  "LLM",
  "STEM",
  "STEAM",
  "IB",
  "AP",
  "SAT",
  "ACT",
  "TOEFL",
  "IELTS",
  "PBL",
  "SEL",
  "ADHD",
  "ABA",
]);
const EDU_TERM_KEYWORD_PATTERN =
  /(教育|学习|教学|课程|课堂|学校|家校|教师|学生|学科|认知|记忆|专注|执行功能|神经可塑性|心理|发展|成长|评估|反馈|动机|阅读|写作|数学|语文|英语|科学|双减|素养|思维|干预|训练|能力|策略|方法|理论|模型|机制|元认知|项目式学习|差异化教学)/;
const CHINESE_FILLER_PATTERN = /^(?:[啊呀嗯哦呃哎欸诶唉哈喂啦呢嘛吧]{1,6}|对{2,}|嗯{2,}|呃{2,})$/;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeForMatch(value: unknown): string {
  return asText(value).toLowerCase().replace(/[，。！？、,.!?;:：\s\-_()[\]{}"'“”‘’]/g, "");
}

function appearsInSourceText(term: string, sourceText: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  const normalizedSource = normalizeForMatch(sourceText);
  if (!normalizedTerm || !normalizedSource) return false;
  return normalizedSource.includes(normalizedTerm);
}

export function normalizeDictionaryTerm(value: unknown): string {
  return asText(value).toLowerCase().replace(/\s+/g, "");
}

export function isHighQualityEducationTerm(value: unknown): boolean {
  const term = asText(value);
  if (!term) return false;
  if (term.length < 2 || term.length > 24) return false;
  if (GENERIC_NEGATIVE_TERMS.has(term)) return false;
  if (CHINESE_FILLER_PATTERN.test(term)) return false;
  if (/[。！？；：，,.!?;:]/.test(term)) return false;
  if (CLAUSE_LEADING_NEGATIVE_PATTERN.test(term)) return false;
  if (term.includes("的")) return false;
  if (/^[我你他她它们我们你们他们她们]/.test(term)) return false;
  if (/(发现|觉得|认为|知道|看到|进行|通过|具备|拥有)/.test(term) && term.length >= 6) return false;
  if (CHINESE_SENTENCE_NEGATIVE_PATTERN.test(term)) return false;
  if (/^[A-Za-z][A-Za-z0-9\-]{1,20}$/.test(term)) {
    return ENGLISH_ALLOWED_TERMS.has(term.toUpperCase());
  }
  if (term.length >= 10 && !EDU_TERM_KEYWORD_PATTERN.test(term)) return false;
  if (!EDU_TERM_KEYWORD_PATTERN.test(term) && term.length >= 8) return false;
  return true;
}

function sanitizeAliases(input: unknown, normalizedTerm: string): string[] {
  if (!Array.isArray(input)) return [];
  return uniqueStrings(
    input
      .map((item) => asText(item))
      .filter((alias) => alias && normalizeDictionaryTerm(alias) !== normalizedTerm)
  ).slice(0, 12);
}

export function sanitizeDictionaryGlossary(input: unknown): DictionaryEntryInput[] {
  if (!Array.isArray(input)) return [];

  const deduped = new Map<string, DictionaryEntryInput>();
  for (const item of input as RawGlossaryItem[]) {
    const term = asText(item?.term);
    const definition = asText(item?.definition);
    const normalizedTerm = normalizeDictionaryTerm(term);
    if (!normalizedTerm || !term || !definition) continue;
    if (!isHighQualityEducationTerm(term)) continue;

    const nextItem: DictionaryEntryInput = {
      term,
      normalizedTerm,
      definition,
      sourceUrl: asText(item?.sourceUrl),
      aliases: sanitizeAliases(item?.aliases, normalizedTerm),
    };

    const prev = deduped.get(normalizedTerm);
    if (!prev) {
      deduped.set(normalizedTerm, nextItem);
      continue;
    }

    deduped.set(normalizedTerm, {
      ...prev,
      term: prev.term || nextItem.term,
      definition: prev.definition || nextItem.definition,
      sourceUrl: prev.sourceUrl || nextItem.sourceUrl,
      aliases: uniqueStrings([...prev.aliases, ...nextItem.aliases]).slice(0, 12),
    });
  }

  return Array.from(deduped.values());
}

export function serializeDictionaryEntry(entry: any) {
  return {
    _id: String(entry._id),
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    definition: entry.definition,
    sourceUrl: entry.sourceUrl || "",
    aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
    relatedEntryIds: Array.isArray(entry.relatedEntryIds)
      ? entry.relatedEntryIds.map((id: any) => String(id))
      : [],
    programIds: Array.isArray(entry.programIds) ? entry.programIds.map((id: any) => String(id)) : [],
    createdFrom: entry.createdFrom,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function collectProgramTermIds() {
  const programs = await Program.find({ dictionaryEntryIds: { $exists: true } }, { dictionaryEntryIds: 1 }).lean();

  return programs.map((program: any) =>
    Array.isArray(program.dictionaryEntryIds) ? program.dictionaryEntryIds.map((id: any) => String(id)) : []
  ).filter((ids) => ids.length > 0);
}

export async function recalculateAllRelatedDictionaryEntries(): Promise<void> {
  const entries = await EducationDictionaryEntry.find({}, { _id: 1, status: 1 }).lean();
  if (!entries.length) return;

  const activeIds = new Set(entries.filter((entry: any) => entry.status === "active").map((entry: any) => String(entry._id)));
  const scoreMap = new Map<string, Map<string, number>>();
  const programTermIds = await collectProgramTermIds();

  for (const termIds of programTermIds) {
    const activeTermIds = uniqueStrings(termIds.filter((id) => activeIds.has(id)));
    for (let i = 0; i < activeTermIds.length; i += 1) {
      for (let j = i + 1; j < activeTermIds.length; j += 1) {
        const left = activeTermIds[i];
        const right = activeTermIds[j];
        if (!scoreMap.has(left)) scoreMap.set(left, new Map());
        if (!scoreMap.has(right)) scoreMap.set(right, new Map());
        scoreMap.get(left)!.set(right, (scoreMap.get(left)!.get(right) || 0) + 1);
        scoreMap.get(right)!.set(left, (scoreMap.get(right)!.get(left) || 0) + 1);
      }
    }
  }

  await Promise.all(
    entries.map(async (entry: any) => {
      const entryId = String(entry._id);
      const relationMap = scoreMap.get(entryId) || new Map<string, number>();
      const relatedEntryIds =
        entry.status !== "active"
          ? []
          : Array.from(relationMap.entries())
              .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0].localeCompare(b[0]);
              })
              .slice(0, 8)
              .map(([id]) => new mongoose.Types.ObjectId(id));

      await EducationDictionaryEntry.findByIdAndUpdate(entry._id, { relatedEntryIds }, { new: false });
    })
  );
}

async function detachProgramFromRemovedEntries(programId: string, dictionaryEntryIds: string[]) {
  await EducationDictionaryEntry.updateMany(
    {
      _id: { $nin: dictionaryEntryIds.map((id) => new mongoose.Types.ObjectId(id)) },
      programIds: new mongoose.Types.ObjectId(programId),
    },
    { $pull: { programIds: new mongoose.Types.ObjectId(programId) } }
  );
}

export async function syncProgramDictionaryEntries(
  programId: string,
  glossaryInput: unknown,
  createdFrom: "ai_program" | "migration" = "ai_program",
  options: SyncDictionaryOptions = {}
) {
  const sourceText = asText(options.sourceText);
  let glossary = sanitizeDictionaryGlossary(glossaryInput);
  if (sourceText) {
    glossary = glossary.filter((item) => appearsInSourceText(item.term, sourceText));
  }
  const nextEntryIds: string[] = [];

  for (const item of glossary) {
    const existing = await EducationDictionaryEntry.findOne({ normalizedTerm: item.normalizedTerm });
    if (!existing) {
      const created = await EducationDictionaryEntry.create({
        term: item.term,
        normalizedTerm: item.normalizedTerm,
        definition: item.definition,
        sourceUrl: item.sourceUrl,
        aliases: item.aliases,
        relatedEntryIds: [],
        programIds: [new mongoose.Types.ObjectId(programId)],
        createdFrom,
        status: "active",
      });
      nextEntryIds.push(String(created._id));
      continue;
    }

    const nextAliases = uniqueStrings([...(existing.aliases || []), ...item.aliases]).slice(0, 12);
    const programIds = uniqueStrings([...(existing.programIds || []).map((id: any) => String(id)), programId]).map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    await EducationDictionaryEntry.findByIdAndUpdate(
      existing._id,
      {
        aliases: nextAliases,
        programIds,
        term: existing.term || item.term,
        definition: existing.definition || item.definition,
        sourceUrl: existing.sourceUrl || item.sourceUrl,
      },
      { new: false }
    );
    nextEntryIds.push(String(existing._id));
  }

  await detachProgramFromRemovedEntries(programId, nextEntryIds);

  await Program.findByIdAndUpdate(
    programId,
    {
      dictionaryEntryIds: nextEntryIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
    { new: false }
  );

  await recalculateAllRelatedDictionaryEntries();
  return nextEntryIds;
}

export async function importDictionaryEntriesFromPrograms(programIds: string[]) {
  const validIds = uniqueStrings(programIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const programs = await Program.find({ _id: { $in: validIds } });

  for (const program of programs) {
    await syncProgramDictionaryEntries(String(program._id), program.termGlossary || [], "migration");
  }

  return programs.length;
}

export async function removeProgramFromDictionary(programId: string) {
  const objectId = new mongoose.Types.ObjectId(programId);
  await EducationDictionaryEntry.updateMany({ programIds: objectId }, { $pull: { programIds: objectId } });
  await Program.findByIdAndUpdate(programId, { dictionaryEntryIds: [] }, { new: false });
  await recalculateAllRelatedDictionaryEntries();
}

export async function migrateExistingProgramGlossaries() {
  const programs = await Program.find({ termGlossary: { $exists: true } });
  let migratedPrograms = 0;
  for (const program of programs) {
    if (!Array.isArray(program.termGlossary) || program.termGlossary.length === 0) continue;
    await syncProgramDictionaryEntries(String(program._id), program.termGlossary || [], "migration");
    migratedPrograms += 1;
  }
  return { migratedPrograms };
}

export async function attachDictionaryEntriesToPrograms<T extends any>(programs: T | T[], includeHidden = false) {
  const items = Array.isArray(programs) ? programs : [programs];
  if (!items.length) return Array.isArray(programs) ? [] : programs;

  const entryIdSet = new Set<string>();
  for (const program of items) {
    const rawIds = Array.isArray((program as any)?.dictionaryEntryIds) ? (program as any).dictionaryEntryIds : [];
    rawIds.forEach((id: any) => {
      if (id) entryIdSet.add(String(id));
    });
  }

  const dictionaryEntries = await EducationDictionaryEntry.find({
    _id: { $in: Array.from(entryIdSet) },
    ...(includeHidden ? {} : { status: "active" }),
  }).lean();

  const filteredEntries = dictionaryEntries.filter((entry: any) => isHighQualityEducationTerm(entry?.term));
  const entryMap = new Map(filteredEntries.map((entry: any) => [String(entry._id), serializeDictionaryEntry(entry)]));

  const attachOne = (program: any) => {
    const rawProgram = typeof program?.toObject === "function" ? program.toObject() : { ...program };
    const rawIds = Array.isArray(rawProgram.dictionaryEntryIds) ? rawProgram.dictionaryEntryIds : [];
    rawProgram.dictionaryEntryIds = rawIds.map((id: any) => String(id));
    rawProgram.dictionaryEntries = rawProgram.dictionaryEntryIds
      .map((id: string) => entryMap.get(id))
      .filter(Boolean);
    return rawProgram;
  };

  const result = items.map(attachOne);
  return Array.isArray(programs) ? result : result[0];
}

export async function updateDictionaryEntry(
  id: string,
  payload: {
    term?: unknown;
    definition?: unknown;
    sourceUrl?: unknown;
    aliases?: unknown;
    status?: unknown;
  }
) {
  const existing = await EducationDictionaryEntry.findById(id);
  if (!existing) {
    throw new Error("词条不存在");
  }

  const nextTerm = asText(payload.term) || existing.term;
  const nextNormalizedTerm = normalizeDictionaryTerm(nextTerm);
  if (!nextNormalizedTerm) {
    throw new Error("词条名称不能为空");
  }
  if (!isHighQualityEducationTerm(nextTerm)) {
    throw new Error("词条不符合教育词典质量规则，请使用教育相关术语");
  }

  const duplicate = await EducationDictionaryEntry.findOne({
    normalizedTerm: nextNormalizedTerm,
    _id: { $ne: existing._id },
  });
  if (duplicate) {
    throw new Error("词条名称已存在");
  }

  existing.term = nextTerm;
  existing.normalizedTerm = nextNormalizedTerm;
  existing.definition = asText(payload.definition) || existing.definition;
  if (payload.sourceUrl !== undefined) {
    existing.sourceUrl = asText(payload.sourceUrl);
  }
  if (payload.aliases !== undefined) {
    existing.aliases = sanitizeAliases(payload.aliases, nextNormalizedTerm);
  }
  if (payload.status === "active" || payload.status === "hidden") {
    existing.status = payload.status;
  }
  await existing.save();
  await recalculateAllRelatedDictionaryEntries();
  return serializeDictionaryEntry(existing.toObject());
}
