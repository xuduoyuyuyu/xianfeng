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

test("admin welfare page is routed and named Xiaowanzi treasure box", () => {
  assert.match(appSource, /import AdminWelfarePage from "\.\/pages\/admin\/AdminWelfarePage";/);
  assert.match(appSource, /<Route path="welfare" element=\{<AdminWelfarePage \/>} \/>/);
  assert.match(layoutSource, /\/admin\/welfare/);
  assert.match(layoutSource, /小玩子百宝箱/);
  assert.match(layoutSource, /\/assets\/welfare-gift-icon\.png/);
  assert.match(source, /小玩子百宝箱/);
});

test("admin welfare page configures campaigns, inventory, dates, upload image, and claim history", () => {
  assert.match(source, /title/);
  assert.match(source, /subtitle/);
  assert.match(source, /description/);
  assert.match(source, /coverImageUrl/);
  assert.match(source, /totalStock/);
  assert.match(source, /startsAt/);
  assert.match(source, /endsAt/);
  assert.match(source, /claimInstructions/);
  assert.match(source, /status/);
  assert.match(source, /uploadCoverImage/);
  assert.match(source, /getAdminWelfareClaims/);
  assert.match(source, /领取记录/);
  assert.match(source, /已过期|过期/);
  assert.match(source, /已抢完/);
});

test("admin welfare api supports CRUD list and claim history", () => {
  assert.match(apiSource, /getAdminWelfareCampaigns/);
  assert.match(apiSource, /createWelfareCampaign/);
  assert.match(apiSource, /updateWelfareCampaign/);
  assert.match(apiSource, /getAdminWelfareClaims/);
  assert.match(apiSource, /uploadAdminImage/);
  assert.match(apiSource, /\/admin\/welfare/);
  assert.match(apiSource, /\/admin\/welfare\/\$\{id\}\/claims/);
});
