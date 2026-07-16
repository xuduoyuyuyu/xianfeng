import assert from "assert";
import {
  buildParagraphTranscriptFromTimedItems,
  buildFaithfulTranscriptChunk,
  applyTranscriptSpeakerAssignments,
  applyTranscriptQualitySegments,
  extractUtteranceSpeaker,
  getVolcengineFlashMaxLocalBytes,
  isVolcengineStandardQueryComplete,
  needsTranscriptSpeakerAttribution,
  normalizeVolcenginePublicSourceUrl,
  shouldContinueVolcengineStandardPolling,
  shouldAttemptVolcengineFlashEndpoint,
  shouldUseVolcengineStandardEndpoint,
} from "./programAi";

assert.deepEqual(buildFaithfulTranscriptChunk([
  { time: "00:00-00:10", speaker: "主播·阿力", text: "欢迎收听家长先锋。" },
  { time: "00:10-00:20", speaker: "主播·阿力", text: "今天继续聊教育。" },
], ["魏亚妮"])?.map((item) => ({ time: item.time, speaker: item.speaker, text: item.text })), [{
  time: "00:00-00:20",
  speaker: "主播·阿力",
  text: "欢迎收听家长先疯。今天继续聊教育。",
}]);

assert.deepEqual(
  applyTranscriptQualitySegments([
    { time: "00:00-00:05", speaker: "嘉宾·魏亚妮", text: "短句" },
    { time: "00:05-00:10", speaker: "嘉宾·魏亚妮", text: "回答" },
  ], [{
    startIndex: 0,
    endIndex: 1,
    speaker: "嘉宾·魏亚妮",
    text: "这是一段经过整理后的完整中文逐字稿内容，去除了重复口头语，并确保表达连贯清晰，长度也符合最终入库要求。",
  }], ["魏亚妮"])?.map((item) => ({ speaker: item.speaker, time: item.time })),
  [{ speaker: "嘉宾·魏亚妮", time: "00:00-00:10" }]
);
assert.deepEqual(applyTranscriptQualitySegments([
  { time: "00:00-00:10", speaker: "主播·阿力", text: "原文内容".repeat(30) },
], [{
  startIndex: 0,
  endIndex: 0,
  speaker: "主播·阿力",
  text: `${"这是一段完整内容。".repeat(24)}最后补充。`,
}], ["魏亚妮"])?.map((item) => item.text.length), [198, 23]);
assert.equal(applyTranscriptQualitySegments([
  { time: "00:00-00:10", speaker: "主播·阿力", text: "原文内容".repeat(30) },
], [{
  startIndex: 0,
  endIndex: 0,
  speaker: "主播·阿力",
  text: `${"字".repeat(200)}。尾`,
}], ["魏亚妮"])?.every((item) => item.text.length <= 200), true);
assert.deepEqual(applyTranscriptQualitySegments([
  { time: "00:00-00:05", speaker: "主播·阿力", text: "短句" },
], [{ startIndex: 0, endIndex: 0, speaker: "主播·阿力", text: "不足五十字" }], ["魏亚妮"])?.map((item) => item.text), ["短句"]);
const faithfulSourceText = "这是音频识别得到的真实原文内容，需要在整理结果过度缩短时完整保留，不能为了长度要求丢失事实。";
assert.deepEqual(applyTranscriptQualitySegments([
  { time: "00:00-00:20", speaker: "主播·阿力", text: faithfulSourceText },
], [{ startIndex: 0, endIndex: 0, speaker: "主播·阿力", text: "过度缩短" }], ["魏亚妮"])?.map((item) => item.text), [faithfulSourceText]);
assert.equal(needsTranscriptSpeakerAttribution([
  { time: "0", speaker: "主播·阿力", text: "1" },
  { time: "1", speaker: "主播·Jessie", text: "2" },
  { time: "2", speaker: "主播·阿力", text: "3" },
  { time: "3", speaker: "主播·Jessie", text: "4" },
]), true);
assert.equal(needsTranscriptSpeakerAttribution([
  { time: "0", speaker: "主播·阿力", text: "1" },
  { time: "1", speaker: "嘉宾·魏亚妮", text: "2" },
  { time: "2", speaker: "主播·阿力", text: "3" },
  { time: "3", speaker: "嘉宾·魏亚妮", text: "4" },
]), false);
assert.equal(needsTranscriptSpeakerAttribution([
  { time: "0", speaker: "主播·阿力", text: "1" },
  { time: "1", speaker: "嘉宾1", text: "2" },
  { time: "2", speaker: "主播·阿力", text: "3" },
  { time: "3", speaker: "嘉宾1", text: "4" },
]), true);

const singleSpeakerTranscript = [
  { time: "00:00-00:10", speaker: "阿力", text: "今天我们请老师聊聊为什么离开学校。" },
  { time: "00:10-00:20", speaker: "阿力", text: "我觉得人生没有几个两年，所以选择辞职。" },
];
assert.deepEqual(
  applyTranscriptSpeakerAssignments(singleSpeakerTranscript, [
    { index: 0, speaker: "主播·阿力" },
    { index: 1, speaker: "嘉宾·魏亚妮" },
  ], ["魏亚妮"])?.map((item) => item.speaker),
  ["主播·阿力", "嘉宾·魏亚妮"]
);
assert.deepEqual(
  applyTranscriptSpeakerAssignments(singleSpeakerTranscript, [
    { index: 0, speaker: "主播·阿力" },
    { index: 1, speaker: "主播·Jessie" },
  ], [])?.map((item) => item.speaker),
  ["主播·阿力", "主播·Jessie"]
);
assert.equal(
  applyTranscriptSpeakerAssignments(singleSpeakerTranscript, [
    { index: 0, speaker: "阿力" },
    { index: 1, speaker: "阿力" },
  ], ["魏亚妮"]),
  null
);

assert.equal(extractUtteranceSpeaker({ additions: { speaker: "2" } }), "2");
assert.deepEqual(
  buildParagraphTranscriptFromTimedItems([
    { startSec: 0, endSec: 5, speaker: "1", text: "大家好，我是 Jessie，欢迎收听本期家长先疯。" },
    { startSec: 6, endSec: 12, speaker: "2", text: "哈喽，我是阿力，今天我们来聊孩子的阅读。" },
    { startSec: 13, endSec: 20, speaker: "3", text: "谢谢邀请，我先从自己的教学经历开始分享。" },
  ]).map((item) => item.speaker),
  ["Jessie", "阿力", "嘉宾"]
);
assert.deepEqual(
  buildParagraphTranscriptFromTimedItems([
    { startSec: 0, endSec: 5, speaker: "1", text: "欢迎收听本期家长先疯，今天我们聊亲子关系。" },
    { startSec: 6, endSec: 12, speaker: "2", text: "谢谢邀请，我先分享一个真实案例。" },
  ]).map((item) => item.speaker),
  ["阿力", "嘉宾"]
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
