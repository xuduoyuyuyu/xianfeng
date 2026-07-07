import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminMamaResourcesPage.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "../../components/AdminLayout.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../../services/api.ts"), "utf8");
const backendSource = readFileSync(resolve(__dirname, "../../../../backend/src/routes/adminMamaResource.ts"), "utf8");

test("admin mama resource pool is routed and appears in the sidebar", () => {
  assert.match(appSource, /import AdminMamaResourcesPage from "\.\/pages\/admin\/AdminMamaResourcesPage";/);
  assert.match(appSource, /AdminMamaResourceReviewPage/);
  assert.match(appSource, /<Route path="mama-resources" element=\{<AdminMamaResourcesPage \/>} \/>/);
  assert.match(appSource, /<Route path="mama-resources\/review" element=\{<AdminMamaResourceReviewPage \/>} \/>/);
  assert.match(layoutSource, /\/assets\/mama-hao-zhuan-icon\.png/);
  assert.match(layoutSource, /妈妈好赚/);
});

test("admin mama resources page uses the Mama Haozhuan product name", () => {
  assert.match(source, /妈妈好赚/);
  assert.doesNotMatch(source, /<h1[^>]*>妈妈资源池<\/h1>/);
});

test("admin mama resources page exposes review states and filters", () => {
  assert.match(source, /mode === "review"/);
  assert.match(source, /账号资料审核/);
  assert.match(source, /待审核/);
  assert.match(source, /可派单/);
  assert.match(source, /资料不足/);
  assert.match(source, /暂不合适/);
  assert.match(source, /minFollowers/);
  assert.match(source, /categoryFilter/);
  assert.match(source, /statusFilter/);
  assert.match(source, /searchText/);
});

test("admin mama resources page shows account cards without removed offer and case sync fields", () => {
  assert.match(source, /粉丝数/);
  assert.match(source, /实名认证/);
  assert.match(source, /主页截图/);
  assert.match(source, /screenshotUrl/);
  assert.match(source, /realNameVerified/);
  assert.match(source, /childGender/);
  assert.match(source, /账号定位/);
  assert.doesNotMatch(source, /历史案例/);
  assert.doesNotMatch(source, /报价|频率/);
  assert.doesNotMatch(source, /点赞|收藏/);
  assert.doesNotMatch(source, /manualCases|contentCases|rateCard/);
  assert.match(source, /运营备注/);
});

test("admin mama resource api supports list, review, and manual update", () => {
  assert.match(apiSource, /export interface MamaResourceProfile/);
  assert.match(apiSource, /childGender\?: string;/);
  assert.match(apiSource, /screenshotUrl\?: string;/);
  assert.match(apiSource, /realNameVerified\?: boolean \| null;/);
  assert.match(apiSource, /getMamaResources: \(params\?: MamaResourceQuery\)/);
  assert.match(apiSource, /reviewMamaResource: \(id: string, data: MamaResourceReviewInput\)/);
  assert.match(apiSource, /updateMamaResource: \(id: string, data: Partial<MamaResourceProfile>\)/);
  assert.match(apiSource, /\/admin\/mama-resources/);
});

test("admin mama resources page supports task shelving and account selection inside the task", () => {
  assert.match(source, /任务上架\/选号/);
  assert.match(source, /任务上架和账号选号/);
  assert.match(source, /账号选号/);
  assert.match(source, /按标签筛选/);
  assert.match(source, /定向选择账号/);
  assert.match(source, /上架新任务/);
  assert.match(source, /创建新任务/);
  assert.match(source, /className="rounded-xl bg-\[#6c27d6\][^"]*text-white[^"]*"[\s\S]*打开招募表单/);
  assert.match(source, /onClick=\{openTaskCreate\} disabled=\{taskLoading\} className="rounded-xl bg-\[#6c27d6\][^"]*text-white/);
  assert.match(source, /onClick=\{submitTaskCreate\} disabled=\{taskLoading \|\| taskImageUploading\} className="w-full rounded-xl bg-\[#6c27d6\][^"]*text-white/);
  assert.doesNotMatch(source, /onClick=\{openTaskCreate\} disabled=\{taskLoading\} className="[^"]*bg-emerald-600/);
  assert.doesNotMatch(source, /onClick=\{submitTaskCreate\} disabled=\{taskLoading\} className="[^"]*bg-emerald-600/);
  assert.match(source, /taskDraft/);
  assert.match(source, /submitTaskCreate/);
  assert.match(source, /taskEditingId/);
  assert.match(source, /taskDraftFromTask/);
  assert.match(source, /trafficFeeYuan: string;/);
  assert.match(source, /trafficFeeCents/);
  assert.match(source, /投流费用（元）/);
  assert.match(source, /请输入有效的投流费用/);
  assert.match(source, /项目公告/);
  assert.match(source, /不填则小程序端不展示公告入口/);
  assert.match(source, /openTaskEdit/);
  assert.match(source, /编辑任务/);
  assert.match(source, /保存修改/);
  assert.match(source, /updateMamaResourceTask\(taskEditingId, payload\)/);
  assert.match(source, /type TaskCreateMessage = \{ type: "error" \| "success"; text: string \};/);
  assert.match(source, /exampleImageUrls: string\[\];/);
  assert.match(source, /taskCreateMessage/);
  assert.match(source, /taskImageUploading/);
  assert.match(source, /handleTaskExampleImageUpload/);
  assert.match(source, /配图示意图/);
  assert.match(source, /type="file"[\s\S]*accept="image\/\*"[\s\S]*multiple/);
  assert.match(source, /taskDraft\.exampleImageUrls\.map/);
  assert.match(source, /resolveAdminAssetUrl\(url\)/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /exampleImageUrls: taskDraft\.exampleImageUrls/);
  assert.match(source, /请输入有效的单价/);
  assert.match(source, /matchCategories/);
  assert.match(source, /matchRiskTags/);
  assert.match(source, /minFollowerCount/);
  assert.match(source, /autoAssign/);
  assert.doesNotMatch(source, /上架任推邦测试任务/);
  assert.match(source, /任推邦（红薯）评论/);
  assert.match(source, /selectedCandidateIds/);
  assert.match(source, /assignSelectedTaskCandidates/);
  assert.match(source, /reviewAssignment/);
  assert.doesNotMatch(source, /审核通过后，后台给账号分配测试任务/);

  assert.match(apiSource, /export interface MamaResourceTask/);
  assert.match(apiSource, /matchCategories\?: string\[\];/);
  assert.match(apiSource, /matchRiskTags\?: string\[\];/);
  assert.match(apiSource, /trafficFeeCents\?: number \| null;/);
  assert.match(apiSource, /minFollowerCount\?: number \| null;/);
  assert.match(apiSource, /exampleImageUrls\?: string\[\];/);
  assert.match(apiSource, /autoAssign\?: boolean;/);
  assert.match(apiSource, /export interface MamaResourceTaskAssignment/);
  assert.match(apiSource, /export interface MamaResourceTaskCandidate/);
  assert.match(apiSource, /getMamaResourceTasks: \(\)/);
  assert.match(apiSource, /createMamaResourceTask: \(data: MamaResourceTaskInput\)/);
  assert.match(apiSource, /updateMamaResourceTask: \(id: string, data: MamaResourceTaskInput\)/);
  assert.match(apiSource, /getMamaResourceTaskCandidates/);
  assert.match(apiSource, /assignMamaResourceTaskProfiles/);
  assert.match(apiSource, /reviewMamaResourceTaskAssignment/);
  assert.match(apiSource, /\/admin\/mama-resources\/tasks\/\$\{id\}\/candidates/);
  assert.match(apiSource, /\/admin\/mama-resources\/tasks\/assignments\/\$\{id\}\/review/);
  assert.match(backendSource, /router\.patch\("\/tasks\/:taskId"/);
  assert.match(backendSource, /buildTaskWritePayload\(req\.body, title\)/);
});

test("admin mama resources detail editing is handled in a modal instead of a right rail", () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /closeEdit/);
  assert.match(source, /编辑资源详情/);
  assert.match(source, /rounded-full[^"]*审核\/补录|审核\/补录[\s\S]*rounded-full/);
  assert.doesNotMatch(source, /xl:grid-cols-\[1fr_420px\]/);
  assert.doesNotMatch(source, /选择一条资源后，可以补充账号基础数据/);
});
