import assert from "node:assert/strict";
import test from "node:test";
import { buildFeishuBackfillPreview, firstHttpUrl } from "./mamaResourceFeishuBackfill";

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

test("preview writes nonstandard publication proof unchanged for manual review", () => {
  const values = [["UID", "达人名称", "稿件的链接", "发布链接"], ["123", "", "稿件", ""]];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "张三", accountName: "", profileUrl: "", followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [{ contentUrl: "稿件", publishedAt: "", proofLink: "https://www.xiaohongshu.com/user/profile/abc" }],
  }]]));
  assert.equal(preview.changes.find((item) => item.field === "发布链接")?.value, "https://www.xiaohongshu.com/user/profile/abc");
  assert.equal(preview.issues[0]?.reason, "回传内容不是有效发布链接，已原样填写，请人工拆分");
});

test("profile URL keeps only the URL from shared text", () => {
  const sharedText = "我在小红书收获了509次赞与收藏，点击链接或复制口令来看我的主页>> https://xhslink.cn/o/3UIWwSA19pH";
  assert.equal(firstHttpUrl(sharedText), "https://xhslink.cn/o/3UIWwSA19pH");
  const values = [["UID", "达人名称", "主页链接"], ["123", "", ""]];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "张三", accountName: "", profileUrl: sharedText, followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [],
  }]]));
  assert.equal(preview.changes.find((item) => item.field === "主页链接")?.value, "https://xhslink.cn/o/3UIWwSA19pH");
});

test("preview matches a Feishu rich link across tenant domains and tracking parameters", () => {
  const values = [
    ["UID", "达人名称", "稿件的链接", "发布时间", "发布链接"],
    ["123", "", { text: "查看稿件", link: "https://shuyuxinzhi.feishu.cn/wiki/ManuscriptToken?sheet=abc" }, "", ""],
  ];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "张三", accountName: "", profileUrl: "", followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [{
      contentUrl: "https://my.feishu.cn/wiki/ManuscriptToken?from=from_copylink",
      publishedAt: "2026-08-26 10:00",
      proofLink: "https://xhslink.com/o/published-note",
    }],
  }]]));
  assert.deepEqual(preview.changes.filter((item) => ["发布时间", "发布链接"].includes(item.field)).map((item) => item.cell), ["D2", "E2"]);
});

test("publication proof keeps only the URL from shared text", () => {
  const values = [["UID", "稿件的链接", "发布时间", "发布链接"], ["123", "稿件 https://my.feishu.cn/wiki/manuscript", "", ""]];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "", accountName: "", profileUrl: "", followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [{
      contentUrl: "https://my.feishu.cn/wiki/manuscript?from=from_copylink",
      publishedAt: "2026-08-26 10:00",
      proofLink: "复制口令打开作品 https://xhslink.cn/o/published-note 。",
    }],
  }]]));
  assert.equal(preview.changes.find((item) => item.field === "发布链接")?.value, "https://xhslink.cn/o/published-note");
});

test("preview recognizes the production sheet manuscript and publication headers", () => {
  const values = [["UID", "达人名称", "稿件", "发布时间", "发布连接"], ["123", "", "https://my.feishu.cn/wiki/manuscript", "", ""]];
  const preview = buildFeishuBackfillPreview(values, new Map([["123", {
    publicUid: "123", displayName: "张三", accountName: "", profileUrl: "", followerCount: null,
    alipayAccount: "", alipayVerifiedName: "", publications: [{
      contentUrl: "https://my.feishu.cn/wiki/manuscript",
      publishedAt: "2026-08-26 10:00",
      proofLink: "https://xhslink.cn/o/published-note",
    }],
  }]]));
  assert.deepEqual(preview.changes.filter((item) => ["发布时间", "发布链接"].includes(item.field)).map((item) => item.cell), ["D2", "E2"]);
});
