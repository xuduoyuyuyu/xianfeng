import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { resolveModelRegistryApiKey } from "./agentModelRegistry";

const originalAiApiKey = process.env.AI_API_KEY;
const originalDeepseekApiKey = process.env.DEEPSEEK_API_KEY;

after(() => {
  if (originalAiApiKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalAiApiKey;
  if (originalDeepseekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalDeepseekApiKey;
});

before(() => {
  delete process.env.AI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
});

test("DeepSeek registry items prefer the current environment key over a stored key", () => {
  process.env.AI_API_KEY = "current-ai-key";

  assert.equal(
    resolveModelRegistryApiKey({
      id: "deepseek-v4-flash",
      provider: "Deepseek",
      model_name: "deepseek-v4-flash",
      api_key: "stale-store-key",
    }),
    "current-ai-key"
  );
});

test("DeepSeek-specific key wins over the generic AI key", () => {
  process.env.AI_API_KEY = "current-ai-key";
  process.env.DEEPSEEK_API_KEY = "current-deepseek-key";

  assert.equal(
    resolveModelRegistryApiKey({
      id: "default-openai-deepseek-v4",
      provider: "Deepseek",
      model_name: "deepseek-v4-pro",
      api_key: "stale-store-key",
    }),
    "current-deepseek-key"
  );
});

test("non-DeepSeek registry items keep their stored key", () => {
  process.env.AI_API_KEY = "current-ai-key";

  assert.equal(
    resolveModelRegistryApiKey({
      id: "doubao-seedream-5-0-260128",
      provider: "Doubao",
      model_name: "Doubao-Seedream-5.0",
      api_key: "stored-doubao-key",
    }),
    "stored-doubao-key"
  );
});
