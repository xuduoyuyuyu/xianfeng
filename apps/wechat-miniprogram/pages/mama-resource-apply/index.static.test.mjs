import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsSource = readFileSync(resolve(__dirname, "index.js"), "utf8");
const wxmlSource = readFileSync(resolve(__dirname, "index.wxml"), "utf8");

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
  assert.match(wxmlSource, /任务中心/);
  assert.match(wxmlSource, /项目价格/);
  assert.match(wxmlSource, /提交回填/);
  assert.match(wxmlSource, /上传完成截图/);
});

test("submitted mama resource account sees a dedicated review status page", () => {
  assert.match(jsSource, /mamaResourceView: "reviewing"/);
  assert.match(jsSource, /profile\.status === "approved" \? "tasks" : "reviewing"/);
  assert.match(jsSource, /readStoredUserMobile\(\)/);
  assert.match(jsSource, /contactPhone: storedDraft\.contactPhone \|\| userMobile/);

  assert.match(wxmlSource, /mamaResourceView === 'reviewing'/);
  assert.match(wxmlSource, /资料正在审核/);
  assert.match(wxmlSource, /审核通过后会进入任务中心/);
  assert.match(wxmlSource, /重新提交资料/);
});
