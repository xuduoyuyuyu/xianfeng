import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTopicGuestSharePromptBlock } from "./topicAiGenerator";

describe("topicAiGenerator guest-share context", () => {
  it("promotes matched guest knowledge snippets above generic advice", () => {
    const block = buildTopicGuestSharePromptBlock([
      {
        sourceTitle: "邓建国教授分享",
        locator: "节目逐字稿 12:30",
        text: "孩子桌游选择时，先看规则复杂度，再看是否能促进复盘表达。",
        url: "/programs/ep-test",
      },
    ]);

    assert.match(block, /站内嘉宾分享/);
    assert.match(block, /优先级高于通用教育经验/);
    assert.match(block, /邓建国教授分享 \/ 节目逐字稿 12:30/);
    assert.match(block, /桌游选择/);
    assert.match(block, /禁止编造未提供的嘉宾/);
  });

  it("stays empty when no guest knowledge snippets are available", () => {
    assert.equal(buildTopicGuestSharePromptBlock([]), "");
    assert.equal(buildTopicGuestSharePromptBlock([{ sourceTitle: "空资料", locator: "", text: "   " }]), "");
  });
});
