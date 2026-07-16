import assert from "assert";
import {
  buildParagraphTranscriptFromTimedItems,
  extractUtteranceSpeaker,
  getVolcengineFlashMaxLocalBytes,
  isVolcengineStandardQueryComplete,
  normalizeVolcenginePublicSourceUrl,
  shouldContinueVolcengineStandardPolling,
  shouldAttemptVolcengineFlashEndpoint,
  shouldUseVolcengineStandardEndpoint,
} from "./programAi";

assert.equal(extractUtteranceSpeaker({ additions: { speaker: "2" } }), "2");
assert.deepEqual(
  buildParagraphTranscriptFromTimedItems([
    { startSec: 0, endSec: 5, speaker: "1", text: "大家好，我是 Jessie，欢迎收听本期家长先疯。" },
    { startSec: 6, endSec: 12, speaker: "2", text: "哈喽，我是阿力，今天我们来聊孩子的阅读。" },
    { startSec: 13, endSec: 20, speaker: "3", text: "谢谢邀请，我先从自己的教学经历开始分享。" },
  ]).map((item) => item.speaker),
  ["Jessie", "阿力", "嘉宾"]
);

assert.equal(
  normalizeVolcenginePublicSourceUrl(
    "http://xianfeng_backend:3001/uploads/audio/episode.mp3",
    "https://xianfeng.xinzhi.info"
  ),
  "https://xianfeng.xinzhi.info/uploads/audio/episode.mp3"
);

assert.equal(
  normalizeVolcenginePublicSourceUrl(
    "http://example.com/uploads/audio/episode.mp3",
    "https://xianfeng.xinzhi.info/base"
  ),
  "https://xianfeng.xinzhi.info/uploads/audio/episode.mp3"
);

assert.equal(shouldUseVolcengineStandardEndpoint("volc.bigasr.auc", "flash"), true);
assert.equal(shouldUseVolcengineStandardEndpoint("volc.bigasr.auc_turbo", "flash"), false);
assert.equal(shouldAttemptVolcengineFlashEndpoint("volc.bigasr.auc", "flash"), false);
assert.equal(shouldAttemptVolcengineFlashEndpoint("volc.bigasr.auc_turbo", "flash"), true);
assert.equal(getVolcengineFlashMaxLocalBytes(), 25 * 1024 * 1024);
assert.equal(shouldContinueVolcengineStandardPolling("20000001"), true);
assert.equal(shouldContinueVolcengineStandardPolling("20000002"), true);
assert.equal(shouldContinueVolcengineStandardPolling("20000000"), false);
assert.equal(isVolcengineStandardQueryComplete("20000000"), true);
assert.equal(isVolcengineStandardQueryComplete("20000001"), false);

console.log("programAi volcengine helper tests passed");
