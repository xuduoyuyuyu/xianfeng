import test from "node:test";
import assert from "node:assert/strict";
import { parseWorthBuyInput, refineWorthBuyTitle } from "./worthBuyInput.ts";

test("extracts Taobao short links embedded in share copy", () => {
  const input = "【淘宝】大促价保 https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h MF278 「杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯」 点击链接直接打开 或者 淘宝搜索直接打开";

  const parsed = parseWorthBuyInput(input);

  assert.equal(parsed.url, "https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h");
  assert.equal(parsed.extractedTitle, "公牛Ai智能小晴空大路灯");
  assert.equal(parsed.brand, "");
});

test("extracts JD product titles from share copy instead of platform slogans", () => {
  const input = "公牛Ai智能小晴空大路灯 https://3.cn/2R-LTixT?jkl=@Z1bBHD1aPtPm@ 多快好省，购物上京东";

  const parsed = parseWorthBuyInput(input);

  assert.equal(parsed.url, "https://3.cn/2R-LTixT?jkl=@Z1bBHD1aPtPm@");
  assert.equal(parsed.extractedTitle, "公牛Ai智能小晴空大路灯");
  assert.equal(parsed.brand, "");
});

test("refines Taobao marketing product titles into key product names", () => {
  assert.equal(
    refineWorthBuyTitle("杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯"),
    "公牛Ai智能小晴空大路灯"
  );
});

test("keeps plain product names as brand queries", () => {
  const parsed = parseWorthBuyInput("贝亲宽口径奶瓶");

  assert.equal(parsed.url, "");
  assert.equal(parsed.brand, "贝亲宽口径奶瓶");
  assert.equal(parsed.extractedTitle, "");
});
