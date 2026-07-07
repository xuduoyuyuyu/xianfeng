import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminWelfarePage.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "../../components/AdminLayout.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../../services/api.ts"), "utf8");

test("admin welfare page is routed and named treasure box", () => {
  assert.match(appSource, /import AdminWelfarePage from "\.\/pages\/admin\/AdminWelfarePage";/);
  assert.match(appSource, /<Route path="welfare" element=\{<AdminWelfarePage \/>} \/>/);
  assert.match(layoutSource, /\/admin\/welfare/);
  assert.match(layoutSource, /百宝箱/);
  assert.doesNotMatch(layoutSource, /小玩子百宝箱/);
  assert.match(layoutSource, /\/assets\/welfare-gift-icon\.png/);
  assert.match(source, /<h1 className="mt-1 text-3xl font-black text-\[#171321\]">百宝箱<\/h1>/);
});

test("admin welfare page configures campaigns, inventory, dates, upload image, and claim history", () => {
  assert.match(source, /title/);
  assert.match(source, /subtitle/);
  assert.doesNotMatch(source, />\s*描述\s*</);
  assert.doesNotMatch(source, /推荐使用图一礼物 icon 或福利封面图|可选 emoji，也可上传 1MB 以内封面图/);
  assert.match(source, /coverImageUrl/);
  assert.match(source, /coverEmojiOptions/);
  assert.match(source, /maxCoverImageBytes = 1024 \* 1024/);
  assert.match(source, /totalStock/);
  assert.match(source, /startsAt/);
  assert.match(source, /endsAt/);
  assert.match(source, /claimInstructions/);
  assert.match(source, /status/);
  assert.match(source, /uploadCoverImage/);
  assert.match(source, /formModalOpen/);
  assert.match(source, /setFormModalOpen\(true\)/);
  assert.match(source, /const closeFormModal = \(\) => \{/);
  assert.match(source, /role="dialog" aria-modal="true" aria-label=\{editing \? "编辑福利" : "上传福利活动"\}/);
  assert.match(source, /\{formModalOpen \? \(/);
  assert.doesNotMatch(source, /xl:grid-cols-\[420px_1fr\]/);
  assert.match(source, /getAdminWelfareClaims/);
  assert.match(source, /importActivationCodes/);
  assert.match(source, /activationCodeText/);
  assert.match(source, /导入激活码/);
  assert.match(source, /activationCodeRemainingCount/);
  assert.match(source, /领取记录/);
  assert.match(source, /导出对账/);
  assert.match(source, /exportClaims/);
  assert.match(source, /claim\.activationCode/);
  assert.match(source, /claim\.user\?\.nickname/);
  assert.match(source, /claim\.children\?\.length/);
  assert.match(source, /已过期|过期/);
  assert.match(source, /已抢完/);
});

test("admin welfare api supports CRUD list and claim history", () => {
  assert.match(apiSource, /getAdminWelfareCampaigns/);
  assert.match(apiSource, /createWelfareCampaign/);
  assert.match(apiSource, /updateWelfareCampaign/);
  assert.match(apiSource, /importWelfareActivationCodes/);
  assert.match(apiSource, /getAdminWelfareClaims/);
  assert.match(apiSource, /exportAdminWelfareClaims/);
  assert.match(apiSource, /uploadAdminImage/);
  assert.match(apiSource, /\/admin\/welfare/);
  assert.match(apiSource, /\/admin\/welfare\/\$\{id\}\/activation-codes/);
  assert.match(apiSource, /\/admin\/welfare\/\$\{id\}\/claims/);
  assert.match(apiSource, /\/admin\/welfare\/\$\{id\}\/claims\/export/);
});
