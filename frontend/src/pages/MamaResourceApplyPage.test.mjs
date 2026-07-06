import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "MamaResourceApplyPage.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");
const staticSource = readFileSync(resolve(__dirname, "../../public/screens/public-mama-resource-apply.html"), "utf8");

test("mama resource application route is public and avoids account credentials", () => {
  assert.match(appSource, /import MamaResourceApplyPage from "\.\/pages\/MamaResourceApplyPage";/);
  assert.match(appSource, /if \(normalizedPathname === "\/mama-resources\/apply"\) \{\s*return <MamaResourceApplyPage \/>;\s*\}/s);
  assert.match(source, /妈妈好赚/);
  assert.doesNotMatch(source, /妈妈发稿资源池/);
  assert.match(source, /\/assets\/mama-hao-zhuan-icon\.png/);
  assert.match(source, /#5e17eb/);
  assert.doesNotMatch(source, /#eefaf5/);
  assert.doesNotMatch(source, /#fff7e8/);
  assert.match(source, /后续任务派发。/);
  assert.match(staticSource, /后续任务派发。/);
  assert.match(source, /小红书主页链接/);
  assert.doesNotMatch(source, /历史案例链接/);
  assert.match(source, /不需要账号密码/);
  assert.doesNotMatch(source, /password/i);
});

test("mama resource application opens with the icon intro card before the form", () => {
  assert.match(source, /<div className="rounded-\[17px\][\s\S]*妈妈好赚[\s\S]*<form id="mama-resource-apply-form"[\s\S]*className="rounded-\[17px\]/);
  assert.match(source, /<h1 className="text-\[19px\][^"]*">资料提交<\/h1>/);
  assert.doesNotMatch(source, /妈妈好赚资料提交/);
  assert.doesNotMatch(source, /<form id="mama-resource-apply-form"[\s\S]*<img src="\/assets\/mama-hao-zhuan-icon\.png"/);
  assert.match(source, /max-w-\[760px\]/);
  assert.doesNotMatch(source, /xl:grid-cols/);
});

test("mini program mama entry uses a static form page instead of SPA fallback", () => {
  assert.match(staticSource, /<form id="mama-resource-apply-form"/);
  assert.match(staticSource, /<h1>资料提交<\/h1>/);
  assert.doesNotMatch(staticSource, /妈妈好赚资料提交/);
  assert.match(staticSource, /<section class="intro-card">[\s\S]*妈妈好赚[\s\S]*<\/section>\s*<form id="mama-resource-apply-form" class="card">/);
  assert.match(staticSource, /fetch\("\/api\/mama-resources\/applications"/);
  assert.doesNotMatch(staticSource, /programs\/list/);
});

test("mama resource application form submits a light supply profile", () => {
  assert.match(source, /displayName/);
  assert.match(source, /contactPhone/);
  assert.match(source, /contactWechat/);
  assert.match(source, /form\.contactWechat\.trim\(\) &&\s*form\.xiaohongshuProfileUrl\.trim\(\)/);
  assert.doesNotMatch(source, /form\.contactPhone\.trim\(\) &&\s*form\.xiaohongshuProfileUrl\.trim\(\)/);
  assert.match(source, /微信号[\s\S]*name="contactWechat"[\s\S]*优先通过微信添加[\s\S]*手机号[\s\S]*name="contactPhone"[\s\S]*备用联系电话/);
  assert.match(staticSource, /微信号[\s\S]*name="contactWechat"[\s\S]*优先通过微信添加[\s\S]*required[\s\S]*手机号[\s\S]*name="contactPhone"[\s\S]*备用联系电话/);
  assert.doesNotMatch(staticSource, /name="contactPhone"[^>]*required/);
  assert.match(source, /placeholder="上海 \/ 杭州"/);
  assert.match(staticSource, /placeholder="上海 \/ 杭州"/);
  assert.doesNotMatch(source, /上海 \/ 杭州 \/ 线上/);
  assert.doesNotMatch(staticSource, /上海 \/ 杭州 \/ 线上/);
  assert.match(source, /childStage/);
  assert.match(source, /childGender/);
  assert.match(source, /const childGenderOptions = \["男孩", "女孩"\]/);
  assert.match(source, /孩子阶段[\s\S]*name="childStage"[\s\S]*孩子性别[\s\S]*childGenderOptions\.map[\s\S]*type="button"[\s\S]*updateField\("childGender", item\)/);
  assert.match(source, /form\.childGender === item/);
  assert.doesNotMatch(source, /<select[\s\S]*name="childGender"/);
  assert.match(staticSource, /孩子阶段[\s\S]*name="childStage"[\s\S]*孩子性别[\s\S]*class="[^"]*gender-options[^"]*"[\s\S]*data-value="男孩"[\s\S]*data-value="女孩"/);
  assert.doesNotMatch(staticSource, /<select name="childGender"/);
  assert.match(source, /小红书主页链接[\s\S]*xiaohongshuProfileUrl[\s\S]*小红书页面截图[\s\S]*type="file"[\s\S]*accept="image\/\*"/);
  assert.match(source, /uploadMamaResourceScreenshot/);
  assert.match(source, /followerCount/);
  assert.match(source, /粉丝数/);
  assert.match(source, /realNameVerified/);
  assert.match(source, /realNameVerifiedOptions = \[[\s\S]*已实名[\s\S]*未实名[\s\S]*\]/);
  assert.match(source, /是否实名认证[\s\S]*realNameVerifiedOptions\.map/);
  assert.match(staticSource, /小红书主页链接[\s\S]*name="xiaohongshuProfileUrl"[\s\S]*小红书页面截图[\s\S]*type="file"[\s\S]*accept="image\/\*"/);
  assert.match(staticSource, /fetch\("\/api\/mama-resources\/uploads"/);
  assert.match(staticSource, /粉丝数[\s\S]*name="followerCount"/);
  assert.match(staticSource, /是否实名认证[\s\S]*data-value="yes"[\s\S]*已实名[\s\S]*data-value="no"[\s\S]*未实名/);
  assert.match(source, /accountPositioning/);
  assert.match(source, /账号定位[\s\S]*min-h-\[40px\]/);
  assert.match(staticSource, /textarea \{ min-height: 40px;/);
  assert.match(source, /categories/);
  assert.doesNotMatch(source, /报价区间|可接频率|历史案例链接/);
  assert.doesNotMatch(staticSource, /报价区间|可接频率|历史案例链接/);
  assert.doesNotMatch(source, /rateRange|availability|caseLinksText/);
  assert.doesNotMatch(staticSource, /rateRange|availability|caseLinksText/);
  assert.match(source, /暂不接的品类[\s\S]*consentAccepted[\s\S]*我同意家和万事团队/);
  assert.doesNotMatch(source, /acceptsGiftExchange|可以接受产品置换|低预算试单/);
  assert.match(source, /rounded-full border border-\[#6c27d6\][\s\S]*text-\[#6c27d6\][\s\S]*✓/);
  assert.match(staticSource, /暂不接的品类[\s\S]*name="blockedCategories"[\s\S]*name="consentAccepted"[\s\S]*我同意家和万事团队/);
  assert.doesNotMatch(staticSource, /acceptsGiftExchange|可以接受产品置换|低预算试单/);
  assert.match(staticSource, /\.check-circle[\s\S]*border-radius: 999px[\s\S]*color: #6c27d6/);
  assert.match(source, /我同意家和万事团队为发稿资源匹配和运营联系使用以上资料/);
  assert.match(staticSource, /我同意家和万事团队为发稿资源匹配和运营联系使用以上资料/);
  assert.doesNotMatch(source, /我同意家长先疯为发稿资源匹配/);
  assert.doesNotMatch(staticSource, /我同意家长先疯为发稿资源匹配/);
  assert.match(source, /consentAccepted/);
  assert.match(source, /publicApi\.submitMamaResourceApplication/);
});

test("mama resource public api posts applications", () => {
  assert.match(apiSource, /export interface MamaResourceApplicationInput/);
  assert.match(apiSource, /contactWechat: string;/);
  assert.match(apiSource, /contactPhone\?: string;/);
  assert.match(apiSource, /xiaohongshuScreenshotUrl\?: string;/);
  assert.match(apiSource, /followerCount\?: number \| string;/);
  assert.match(apiSource, /realNameVerified\?: boolean \| null;/);
  assert.match(apiSource, /uploadMamaResourceScreenshot/);
  assert.match(apiSource, /api\.post<\{ url: string; filename: string \}>\('\/mama-resources\/uploads'/);
  assert.match(apiSource, /submitMamaResourceApplication: \(data: MamaResourceApplicationInput\)/);
  assert.match(apiSource, /api\.post<\{ profile: MamaResourceProfile \}>\('\/mama-resources\/applications', data\)/);
});
