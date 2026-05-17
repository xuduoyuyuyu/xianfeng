import assert from "assert";
import {
  getVolcengineFlashMaxLocalBytes,
  normalizeVolcenginePublicSourceUrl,
  shouldContinueVolcengineStandardPolling,
  shouldAttemptVolcengineFlashEndpoint,
  shouldUseVolcengineStandardEndpoint,
} from "./programAi";

assert.equal(
  normalizeVolcenginePublicSourceUrl(
    "http://xianfeng_backend:3001/uploads/audio/episode.mp3",
    "https://xianfeng.xinzhi.ai"
  ),
  "https://xianfeng.xinzhi.ai/uploads/audio/episode.mp3"
);

assert.equal(
  normalizeVolcenginePublicSourceUrl(
    "http://example.com/uploads/audio/episode.mp3",
    "https://xianfeng.xinzhi.ai/base"
  ),
  "https://xianfeng.xinzhi.ai/uploads/audio/episode.mp3"
);

assert.equal(shouldUseVolcengineStandardEndpoint("volc.bigasr.auc", "flash"), true);
assert.equal(shouldUseVolcengineStandardEndpoint("volc.bigasr.auc_turbo", "flash"), false);
assert.equal(shouldAttemptVolcengineFlashEndpoint("volc.bigasr.auc", "flash"), false);
assert.equal(shouldAttemptVolcengineFlashEndpoint("volc.bigasr.auc_turbo", "flash"), true);
assert.equal(getVolcengineFlashMaxLocalBytes(), 25 * 1024 * 1024);
assert.equal(shouldContinueVolcengineStandardPolling("20000001"), true);
assert.equal(shouldContinueVolcengineStandardPolling("20000002"), true);
assert.equal(shouldContinueVolcengineStandardPolling("20000000"), false);

console.log("programAi volcengine helper tests passed");
