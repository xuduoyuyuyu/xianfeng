import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ExternalBookDescriptionTranslation from "../models/ExternalBookDescriptionTranslation";
import { getOrCreateExternalBookDescriptionTranslation, translateExternalBookDescriptionToChinese } from "./externalBookDescriptionTranslation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(resolve(__dirname, "externalBookDescriptionTranslation.ts"), "utf8");

test("external book description translation is persisted and reused without a second translator call", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());

  try {
    await ExternalBookDescriptionTranslation.deleteMany({});

    let translateCalls = 0;
    const first = await getOrCreateExternalBookDescriptionTranslation(
      {
        externalBookId: "1985719249691049993",
        title: "Dawn of the Dreadfuls",
        description: "Journey Back to Regency England.",
      },
      async () => {
        translateCalls += 1;
        return { translatedDescription: "重返摄政时代的英格兰。", model: "test-translator" };
      }
    );

    const second = await getOrCreateExternalBookDescriptionTranslation(
      {
        externalBookId: "1985719249691049993",
        title: "Dawn of the Dreadfuls",
        description: "Journey Back to Regency England.",
      },
      async () => {
        translateCalls += 1;
        throw new Error("translator should not run for cached translations");
      }
    );

    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(first.translatedDescription, "重返摄政时代的英格兰。");
    assert.equal(second.translatedDescription, "重返摄政时代的英格兰。");
    assert.equal(second.model, "test-translator");
    assert.equal(translateCalls, 1);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("external book description translation defaults to DeepSeek Flash", () => {
  assert.match(serviceSource, /BOOK_TRANSLATION_AI_MODEL/, "translation should use a translation-specific model setting");
  assert.match(serviceSource, /"deepseek-v4-flash"/, "translation should default to DeepSeek Flash");
  assert.doesNotMatch(serviceSource, /process\.env\.AI_MODEL \|\| "deepseek-v4-flash"/, "generic AI_MODEL should not silently override the translation model");
});

test("external book description translation reads AI key at call time", async () => {
  const originalAiKey = process.env.AI_API_KEY;
  const originalTranslationKey = process.env.BOOK_TRANSLATION_AI_API_KEY;
  const originalDeepseekKey = process.env.DEEPSEEK_API_KEY;
  const originalBaseUrl = process.env.BOOK_TRANSLATION_AI_BASE_URL;
  const originalModel = process.env.BOOK_TRANSLATION_AI_MODEL;
  const originalFetch = globalThis.fetch;
  let requestedAuthorization = "";

  process.env.AI_API_KEY = "test-ai-key";
  delete process.env.BOOK_TRANSLATION_AI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.BOOK_TRANSLATION_AI_BASE_URL = "https://deepseek.test/v1";
  process.env.BOOK_TRANSLATION_AI_MODEL = "deepseek-v4-flash";
  globalThis.fetch = (async (_url: any, init: any) => {
    requestedAuthorization = String(init?.headers?.Authorization || "");
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "中文简介" } }] }),
    } as Response;
  }) as any;

  try {
    const result = await translateExternalBookDescriptionToChinese({
      externalBookId: "runtime-env-check",
      title: "Runtime Env Check",
      description: "A short source description.",
    });

    assert.equal(result.translatedDescription, "中文简介");
    assert.equal(result.model, "deepseek-v4-flash");
    assert.equal(requestedAuthorization, "Bearer test-ai-key");
  } finally {
    if (originalAiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalAiKey;
    if (originalTranslationKey === undefined) delete process.env.BOOK_TRANSLATION_AI_API_KEY;
    else process.env.BOOK_TRANSLATION_AI_API_KEY = originalTranslationKey;
    if (originalDeepseekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
    if (originalBaseUrl === undefined) delete process.env.BOOK_TRANSLATION_AI_BASE_URL;
    else process.env.BOOK_TRANSLATION_AI_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.BOOK_TRANSLATION_AI_MODEL;
    else process.env.BOOK_TRANSLATION_AI_MODEL = originalModel;
    globalThis.fetch = originalFetch;
  }
});
