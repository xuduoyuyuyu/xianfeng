import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./wechatMini.ts", import.meta.url), "utf8");

test("bind-phone switches to an existing mobile account instead of keeping the temporary WeChat account", () => {
  assert.match(source, /router\.post\("\/bind-phone"/);
  assert.match(source, /const existingMobileUser = await findUserByMobile\(mobile\)/);
  assert.match(source, /String\(existingMobileUser\._id\) !== String\(user\._id\)/);
  assert.match(source, /existingMobileUser\.wechatMiniOpenid = user\.wechatMiniOpenid/);
  assert.match(source, /user\.wechatMiniOpenid = ""/);
  assert.match(source, /boundUser = existingMobileUser/);
  assert.match(source, /token: signUserJwt\(boundUser\)/);
  assert.match(source, /user: buildMiniProfile\(boundUser\)/);
});

test("mini login also prefers an existing mobile account over a temporary openid account", () => {
  assert.match(source, /const openidUser = await findUserByWechatIdentity\(session\)/);
  assert.match(source, /const mobileUser = await findUserByMobile\(mobile\)/);
  assert.match(source, /await moveWechatIdentityToTarget\(openidUser, mobileUser, session\)/);
  assert.match(source, /user = mobileUser/);
});

test("topic qrcode route generates a current mini-program code for the share landing page", () => {
  assert.match(source, /router\.get\("\/topic-qrcode"/);
  assert.match(source, /Topic\.findOne\(\{[\s\S]*status: \{ \$ne: "hidden" \}/);
  assert.match(source, /scene: `t=\$\{String\(\(topic as any\)\._id\)\}`/);
  assert.match(source, /page: "pages\/share\/index"/);
  assert.match(source, /fetchWechatMiniUnlimitedQRCode/);
  assert.match(source, /res\.setHeader\("content-type", "image\/png"\)/);
});

test("xiaowanzi conversation shares can be saved and opened through a mini-program code", () => {
  assert.match(source, /import XiaowanziShare from "\.\.\/models\/XiaowanziShare"/);
  assert.match(source, /router\.post\("\/xiaowanzi-shares"/);
  assert.match(source, /XiaowanziShare\.create\(\{/);
  assert.match(source, /messages: sanitizeXiaowanziShareMessages\(req\.body\?\.messages\)/);
  assert.match(source, /router\.get\("\/xiaowanzi-shares\/:shareId"/);
  assert.match(source, /XiaowanziShare\.findById\(req\.params\.shareId\)/);
  assert.match(source, /router\.get\("\/xiaowanzi-share-qrcode"/);
  assert.match(source, /scene: `s=\$\{String\(share\._id\)\}`/);
  assert.match(source, /page: "pages\/share\/index"/);
});
