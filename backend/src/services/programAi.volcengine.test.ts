import assert from "assert";
import {
  normalizeVolcenginePublicSourceUrl,
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

console.log("programAi volcengine helper tests passed");
