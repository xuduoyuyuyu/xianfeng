import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsSource = readFileSync(resolve(__dirname, "index.js"), "utf8");
const wxmlSource = readFileSync(resolve(__dirname, "index.wxml"), "utf8");
const wxssSource = readFileSync(resolve(__dirname, "index.wxss"), "utf8");

test("mama resource form keeps an unsent draft across page exits", () => {
  assert.match(jsSource, /MAMA_RESOURCE_APPLY_DRAFT_KEY/);
  assert.match(jsSource, /loadApplyDraft\(\)/);
  assert.match(jsSource, /saveApplyDraft\(/);
  assert.match(jsSource, /clearApplyDraft\(\)/);
  assert.match(jsSource, /onLoad\(options = \{\}\)[\s\S]*loadApplyDraft\(\)/);
  assert.match(jsSource, /updateDraftField\(event\)/);
  assert.match(jsSource, /chooseXiaohongshuScreenshot\(\)[\s\S]*updatePageApplyDraft\(this, \{ xiaohongshuScreenshotUrl: String\(url \|\| ""\) \}\)/);
  assert.match(jsSource, /截图上传失败：服务器返回异常/);
  assert.match(jsSource, /data\.message \|\| `截图上传失败/);
  assert.match(jsSource, /error && error\.errMsg/);
  assert.match(jsSource, /submit\(event\)[\s\S]*clearApplyDraft\(\)/);

  assert.match(wxmlSource, /name="displayName"[^>]*value="\{\{formDraft\.displayName\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="xiaohongshuProfileUrl"[^>]*value="\{\{formDraft\.xiaohongshuProfileUrl\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="followerCount"[^>]*value="\{\{formDraft\.followerCount\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="blockedCategories"[^>]*value="\{\{formDraft\.blockedCategories\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /checkbox-group name="consentAccepted" bindchange="toggleConsentAccepted"/);
  assert.match(wxmlSource, /<checkbox class="xf-mama-check-circle" value="1" checked="\{\{formDraft\.consentAccepted\}\}"/);
});

test("approved mama resource account can view assigned tasks and submit proof", () => {
  assert.match(jsSource, /loadMamaTasks\(\)/);
  assert.match(jsSource, /url: "\/api\/mama-resources\/me\/tasks"/);
  assert.match(jsSource, /openMamaTask\(event\)/);
  assert.match(jsSource, /chooseTaskProofScreenshot\(\)/);
  assert.match(jsSource, /proofScreenshotUrl/);
  assert.match(jsSource, /submitTaskProof\(\)/);
  assert.match(jsSource, /\/api\/mama-resources\/me\/tasks\/\$\{taskId\}\/submissions/);

  assert.match(wxmlSource, /mamaResourceView === 'tasks'/);
  assert.match(wxmlSource, /mamaResourceView === 'detail'/);
  assert.match(wxmlSource, /xf-mama-task-title[\s\S]*妈妈好赚/);
  assert.match(wxmlSource, /xf-mama-task-hero-icon[\s\S]*\/assets\/menu\/mama-hao-zhuan-icon\.png/);
  assert.match(wxmlSource, /xf-mama-task-logo[\s\S]*\/assets\/menu\/mama-hao-zhuan-icon\.png/);
  assert.match(wxmlSource, /项目价格/);
  assert.match(wxmlSource, /wx:if="\{\{currentMamaTask\.hasTrafficFee\}\}" class="xf-mama-cost-row"/);
  assert.match(wxmlSource, /投流费用/);
  assert.match(wxmlSource, /xf-mama-project-title[\s\S]*项目信息/);
  assert.match(wxmlSource, /xf-mama-example-gallery/);
  assert.match(wxmlSource, /catchtap="previewTaskExampleImage"/);
  assert.match(jsSource, /exampleImageUrls: Array\.isArray\(source\.exampleImageUrls\)/);
  assert.match(jsSource, /trafficFeeCents/);
  assert.match(jsSource, /previewTaskExampleImage\(event\)/);
  assert.doesNotMatch(wxmlSource, /推广流程/);
  assert.match(wxmlSource, /提交回填/);
  assert.match(wxmlSource, /上传完成截图/);
});

test("non-approved mama resource account stays on the application form", () => {
  assert.match(jsSource, /profile\.status !== "approved"/);
  assert.match(jsSource, /mamaResourceView: "apply"/);
  assert.match(jsSource, /mamaTasks: \[\]/);
  assert.doesNotMatch(jsSource, /profile\.status === "approved" \? "tasks" : "reviewing"/);
  assert.match(jsSource, /readStoredUserMobile\(\)/);
  assert.match(jsSource, /contactPhone: storedDraft\.contactPhone \|\| userMobile/);

  assert.match(wxmlSource, /mamaResourceView === 'apply'/);
  assert.match(wxmlSource, /妈妈好赚/);
});

test("task announcement only appears when configured and opens a modal", () => {
  assert.match(wxmlSource, /wx:if="\{\{currentMamaTask\.announcement\}\}" class="xf-mama-notice-row" catchtap="openTaskAnnouncement"/);
  assert.match(wxmlSource, /项目公告/);
  assert.match(wxmlSource, /taskAnnouncementOpen/);
  assert.doesNotMatch(wxmlSource, /项目重要通知/);
  assert.match(jsSource, /openTaskAnnouncement\(\)/);
  assert.match(jsSource, /closeTaskAnnouncement\(\)/);
  assert.match(wxmlSource, /class="xf-mama-dialog" catchtap="noop">\s*<button type="button" class="xf-mama-dialog-close" catchtap="closeTaskAnnouncement">×<\/button>\s*<view class="xf-mama-dialog-head">/);
  assert.match(wxssSource, /\.xf-mama-dialog \{[\s\S]*position: relative;/);
  assert.match(wxssSource, /\.xf-mama-dialog-close \{[\s\S]*position: absolute;[\s\S]*top: 24rpx;[\s\S]*right: 24rpx;/);
});

test("mama resource share card is unified under the mama haozhuan page name", () => {
  assert.match(jsSource, /const MAMA_RESOURCE_SHARE_COVER_IMAGE = "\/assets\/share\/mama-hao-zhuan-cover\.png"/);
  assert.match(jsSource, /title: "妈妈好赚"/);
  assert.match(jsSource, /imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE/);
  assert.doesNotMatch(jsSource, /妈妈好赚资料提交/);
});
