import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "WorthBuyPage.tsx"), "utf8");

test("submitted WorthBuy cards use the same visual structure as demo cards", () => {
  assert.match(source, /const query = item\.query \|\| item\.brand \|\| "";/);
  assert.match(source, /const worthBuyCards = useMemo\(\(\) => buildWorthBuyCardItems\(\{/);
  assert.match(source, /userItems: userSubmissions,/);
  assert.match(source, /demoItems: WORTH_BUY_DEMO_CARDS,/);
  assert.match(source, /\{worthBuyCards\.map\(\(card\) => \(/);
  assert.ok(source.includes("fetch(`/api/worthbuy/my/${encodeURIComponent(brand)}?userId=${encodeURIComponent(userId)}`"));
  assert.match(source, /gridTemplateColumns: "repeat\(auto-fill, minmax\(150px, 1fr\)\)"/);
  assert.match(source, /className="group worthbuy-card rounded-\[1\.4rem\] border border-\[#e2dcf0\] bg-white p-5/);
  assert.match(source, /setUserSubmissions\(\(prev\) => \{/);
  assert.match(source, /const next = \[item, \.\.\.prev\.filter/);
  assert.match(source, /isInvalidWorthBuyResultForQuery\(trimmed, submitData\)/);
  assert.match(source, /isInvalidWorthBuyResultForQuery\(trimmed, checkData\.result\)/);
  assert.doesNotMatch(source, /你的分析记录[\s\S]*在前，示例在后/);
  assert.doesNotMatch(source, /点击示例快速体验/);
  assert.doesNotMatch(source, /background: "linear-gradient\(135deg, #FFFBEB, #FFF7ED\)"/);
  assert.doesNotMatch(source, /border: "1\.5px solid #FDE68A"/);
});

test("failed WorthBuy analysis gives actionable submission guidance", () => {
  assert.match(source, /你可以这样提交/);
  assert.match(source, /完整商品标题/);
  assert.match(source, /品牌 \+ 型号 \+ 品类/);
  assert.match(source, /复制电商分享文案/);
  assert.match(source, /商品链接 \+ 商品名称/);
});
