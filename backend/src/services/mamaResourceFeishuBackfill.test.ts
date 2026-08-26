import assert from "node:assert/strict";
import test from "node:test";
import { buildFeishuBackfillPreview } from "./mamaResourceFeishuBackfill";

test("preview fills blank personal fields and matching publication fields only", () => {
  const values = [
    ["UID", "达人名称", "账号名称", "主页链接", "粉丝数", "支付宝账号", "支付宝姓名", "稿件的链接", "发布时间", "发布链接"],
    ["123", "已有名称", "", "", "", "", "", "https://my.feishu.cn/wiki/manuscript", "", ""],
  ];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "后台名称", accountName: "橘子", profileUrl: "https://www.xiaohongshu.com/user/profile/abc",
    followerCount: 88, alipayAccount: "pay@example.com", alipayVerifiedName: "张三",
    publications: [{ contentUrl: "https://my.feishu.cn/wiki/manuscript", publishedAt: "2026-08-26 10:00", proofLink: "https://www.xiaohongshu.com/explore/note" }],
  }]]));
  assert.equal(preview.changes.some((item) => item.cell === "B2"), false);
  assert.deepEqual(preview.changes.map((item) => item.cell), ["C2", "D2", "E2", "F2", "G2", "I2", "J2"]);
});

test("preview rejects profile links as publication proof", () => {
  const values = [["UID", "达人名称", "稿件的链接", "发布链接"], ["123", "", "稿件", ""]];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "张三", accountName: "", profileUrl: "", followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [{ contentUrl: "稿件", publishedAt: "", proofLink: "https://www.xiaohongshu.com/user/profile/abc" }],
  }]]));
  assert.equal(preview.changes.some((item) => item.field === "发布链接"), false);
  assert.equal(preview.issues[0]?.reason, "回传内容不是有效发布链接，已跳过");
});
