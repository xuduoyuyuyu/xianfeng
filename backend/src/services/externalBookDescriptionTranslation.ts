import crypto from "crypto";
import ExternalBookDescriptionTranslation from "../models/ExternalBookDescriptionTranslation";

type TranslationInput = {
  externalBookId: string;
  title: string;
  description: string;
};

type TranslatorResult = {
  translatedDescription: string;
  model: string;
};

type TranslationResult = TranslatorResult & {
  cached: boolean;
};

type Translator = (input: TranslationInput) => Promise<TranslatorResult>;

const pendingTranslations = new Map<string, Promise<TranslationResult>>();

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: string): string {
  return asText(value).replace(/\s+/g, " ");
}

function hashDescription(value: string): string {
  return crypto.createHash("sha256").update(normalizeWhitespace(value)).digest("hex");
}

function trimAiTranslation(value: string): string {
  return asText(value)
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function resolveBookTranslationAiConfig() {
  const endpoint = (
    process.env.BOOK_TRANSLATION_AI_BASE_URL ||
    process.env.DEEPSEEK_API_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com/v1"
  ).replace(/\/+$/, "");
  const apiKey = process.env.BOOK_TRANSLATION_AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || "";
  const model = process.env.BOOK_TRANSLATION_AI_MODEL || "deepseek-v4-flash";
  return { endpoint, apiKey, model };
}

export async function translateExternalBookDescriptionToChinese(input: TranslationInput): Promise<TranslatorResult> {
  const config = resolveBookTranslationAiConfig();
  if (!config.apiKey) {
    throw new Error("AI 翻译服务未配置");
  }

  const description = normalizeWhitespace(input.description);
  const prompt = [
    "请把下面英文图书简介翻译成自然、准确的中文。",
    "要求：只输出中文译文；保留书名、人名、地名的常见译法；不要添加点评、总结或 Markdown。",
    input.title ? `书名：${input.title}` : "",
    `简介：${description}`,
  ].filter(Boolean).join("\n\n");

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`AI 翻译接口返回 ${response.status}`);
  }

  const payload = await response.json();
  const translatedDescription = trimAiTranslation(String(payload?.choices?.[0]?.message?.content || ""));
  if (!translatedDescription) {
    throw new Error("AI 翻译结果为空");
  }

  return { translatedDescription, model: config.model };
}

export async function getOrCreateExternalBookDescriptionTranslation(
  input: TranslationInput,
  translator: Translator = translateExternalBookDescriptionToChinese
): Promise<TranslationResult> {
  const externalBookId = asText(input.externalBookId);
  const description = normalizeWhitespace(input.description);
  if (!externalBookId) {
    throw new Error("缺少外部图书 ID");
  }
  if (!description) {
    throw new Error("缺少可翻译的简介");
  }

  const existing = await ExternalBookDescriptionTranslation.findOne({ externalBookId }).lean();
  if (existing?.translatedDescription) {
    return {
      translatedDescription: String(existing.translatedDescription || ""),
      model: String(existing.modelName || ""),
      cached: true,
    };
  }

  const pending = pendingTranslations.get(externalBookId);
  if (pending) return pending;

  const work = (async () => {
    const translated = await translator({ ...input, externalBookId, description });
    const saved = await ExternalBookDescriptionTranslation.findOneAndUpdate(
      { externalBookId },
      {
        $setOnInsert: {
          externalBookId,
          title: asText(input.title),
          sourceDescriptionHash: hashDescription(description),
          sourceDescription: description,
          translatedDescription: translated.translatedDescription,
          modelName: translated.model,
        },
      },
      { returnDocument: "after", upsert: true }
    ).lean();

    return {
      translatedDescription: String(saved?.translatedDescription || translated.translatedDescription),
      model: String(saved?.modelName || translated.model),
      cached: false,
    };
  })();

  pendingTranslations.set(externalBookId, work);
  try {
    return await work;
  } finally {
    pendingTranslations.delete(externalBookId);
  }
}

export type { TranslationInput, TranslationResult, TranslatorResult };
