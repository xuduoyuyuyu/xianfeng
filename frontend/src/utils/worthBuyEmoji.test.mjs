import test from "node:test";
import assert from "node:assert/strict";
import { chooseWorthBuyEmoji } from "./worthBuyEmoji.ts";

test("chooses a product-specific emoji for submitted worth-buy cards", () => {
  assert.equal(
    chooseWorthBuyEmoji({
      title: "公牛儿童护眼大路灯",
      result: { reason: "学习阅读专用护眼落地台灯，关注照度和频闪参数。" },
    }),
    "💡"
  );

  assert.equal(
    chooseWorthBuyEmoji({
      title: "贝亲宽口径奶瓶",
      result: { reason: "PPSU材质安全可靠，适合新生儿喂养。" },
    }),
    "🍼"
  );
});

test("falls back to a neutral shopping emoji instead of verdict icons", () => {
  assert.equal(
    chooseWorthBuyEmoji({
      title: "某品牌新品",
      result: { isIqTax: false, reason: "目前证据不足。" },
    }),
    "🛍️"
  );
});
