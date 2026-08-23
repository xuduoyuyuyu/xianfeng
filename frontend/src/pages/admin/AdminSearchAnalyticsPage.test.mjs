import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = fs.readFileSync(fileURLToPath(new URL("./AdminSearchAnalyticsPage.tsx", import.meta.url)), "utf8");
const appSource = fs.readFileSync(fileURLToPath(new URL("../../App.tsx", import.meta.url)), "utf8");
const layoutSource = fs.readFileSync(fileURLToPath(new URL("../../components/AdminLayout.tsx", import.meta.url)), "utf8");
const apiSource = fs.readFileSync(fileURLToPath(new URL("../../services/api.ts", import.meta.url)), "utf8");

test("admin search analytics is routed from the user navigation and reads the aggregate endpoint", () => {
  assert.match(appSource, /path="search-analytics" element=\{<AdminSearchAnalyticsPage \/>\}/);
  assert.match(layoutSource, /\/admin\/search-analytics", "search_insights", "搜索洞察"/);
  assert.match(apiSource, /getSearchAnalytics:[\s\S]*\/admin\/search-analytics/);
});

test("admin search analytics exposes demand, quality, trend, and privacy views", () => {
  for (const label of ["搜索次数", "搜索会话", "独立关键词", "无结果率", "结果点击率", "热门搜索词", "上升关键词", "无结果关键词", "内容命中分布"]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /不保存 IP、OpenID 或用户账号/);
  assert.match(pageSource, /历史访问日志不会混入正式口径/);
  assert.match(pageSource, /books: "书籍"/);
});
