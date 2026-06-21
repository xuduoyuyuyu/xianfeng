import test from "node:test";
import assert from "node:assert/strict";
import { buildWorthBuyCardItems } from "./worthBuyCards.ts";

const demos = [
  { q: "贝亲宽口径奶瓶", icon: "🍼", tag: "母婴" },
  { q: "公牛Ai智能小晴空大路灯", icon: "💡", tag: "非智商税" },
];

test("places user generated WorthBuy cards before demo cards", () => {
  const cards = buildWorthBuyCardItems({
    userItems: [
      {
        query: "公牛Ai智能小晴空大路灯",
        brand: "公牛Ai智能小晴空大路灯",
        result: { brand: "公牛Ai智能小晴空大路灯", score: 50, isIqTax: false },
        createdAt: "2026-06-12T00:00:00.000Z",
      },
    ],
    demoItems: demos,
  });

  assert.equal(cards[0].source, "user");
  assert.equal(cards[0].title, "公牛Ai智能小晴空大路灯");
  assert.equal(cards[1].source, "demo");
  assert.equal(cards[1].title, "贝亲宽口径奶瓶");
});

test("removes demo duplicates when a user generated card has the same title", () => {
  const cards = buildWorthBuyCardItems({
    userItems: [
      {
        query: "【淘宝】大促价保 https://e.tb.cn/h.demo 「杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯」",
        brand: "公牛Ai智能小晴空大路灯",
        result: { brand: "公牛Ai智能小晴空大路灯", score: 50, isIqTax: false },
        createdAt: "2026-06-12T00:00:00.000Z",
      },
    ],
    demoItems: demos,
  });

  assert.deepEqual(cards.map((card) => card.title), ["公牛Ai智能小晴空大路灯", "贝亲宽口径奶瓶"]);
});
