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
  assert.match(layoutSource, /好赚/);
});

test("admin mama resources page uses the Haozhuan product name", () => {
  assert.match(source, /好赚/);
  assert.doesNotMatch(source, /<h1[^>]*>妈妈资源池<\/h1>/);
});

test("admin mama resources page defaults to all profiles and exposes profile filters", () => {
  assert.match(source, /mode === "review"/);
  assert.match(source, /账号资料/);
  assert.match(source, /useState<MamaResourceStatus \| "all">\("all"\)/);
  assert.doesNotMatch(source, /\{ value: "pending", label: "待审核" \}/);
  assert.match(source, /可派单/);
  assert.match(source, /创作能力/);
  assert.match(source, /contentCapabilityFilter/);
  assert.match(backendSource, /filter\.contentCapabilities = \{ \$all: contentCapabilities \}/);
  assert.match(source, /资料不足/);
  assert.match(source, /暂不合适/);
  assert.match(source, /minFollowers/);
  assert.match(source, /categoryFilter/);
  assert.match(source, /statusFilter/);
  assert.match(source, /searchText/);
  assert.match(source, /childStageFilter/);
  assert.match(source, /childGenderFilter/);
  assert.match(source, /userGenderFilter/);
  assert.match(source, /platformFilter/);
  assert.match(source, /全部孩子年龄/);
  assert.match(source, /全部孩子性别/);
  assert.match(source, /全部用户性别/);
  assert.match(source, /小红书/);
  assert.match(source, /抖音/);
  assert.match(source, />\s*查看\s*<\/button>/);
  assert.doesNotMatch(source, /审核\/补录|账号审核和补录|保存审核和人工补录/);
});

test("admin mama resources page shows account cards without removed offer and case sync fields", () => {
  assert.match(source, /粉丝数/);
  assert.match(source, /实名认证/);
  assert.match(source, /主页截图/);
  assert.match(source, /screenshotUrl/);
  assert.match(source, /realNameVerified/);
  assert.match(source, /realNameVerified === true \? "inline-flex rounded-full bg-emerald-50/);
  assert.match(source, /childGender/);
  assert.match(source, /账号定位/);
  assert.doesNotMatch(source, /历史案例/);
  assert.doesNotMatch(source, /报价|频率/);
  assert.doesNotMatch(source, /点赞|收藏/);
  assert.doesNotMatch(source, /manualCases|contentCases|rateCard/);
  assert.match(source, /运营备注/);
  assert.match(source, /className="flex flex-wrap content-start items-start gap-1"/);
  assert.match(source, /className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-\[#f6f0ff\] px-2 py-1 text-xs font-bold leading-none text-\[#5e17eb\]"/);
  assert.match(source, /profile\.mediaAccounts\?\.length \? profile\.mediaAccounts : \[profile\.socialAccount\]/);
  assert.match(source, /account\.nickname \|\| mediaPlatformLabel\[account\.platform\] \|\| "未填昵称"/);
  assert.match(source, /toCount\(account\.followerCount\)/);
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

test("admin mama resources page supports task shelving and claimant operations inside the task", () => {
  assert.match(source, /任务上架\/选号/);
  assert.match(source, /内容下发/);
  assert.match(source, /用户筛选/);
  assert.match(source, /领取任务账号/);
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
  assert.match(source, /claimLimit: string;/);
  assert.match(source, /领取人数限制/);
  assert.match(source, /不填则不限，填写后先到先得/);
  assert.match(source, /claimLimit: Number\.isFinite\(claimLimit\) \? claimLimit : null/);
  assert.match(source, /请输入有效的领取人数限制/);
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
  assert.doesNotMatch(source, /autoAssign/);
  assert.doesNotMatch(source, /上架任推邦测试任务/);
  assert.match(source, /任推邦（红薯）评论/);
  assert.doesNotMatch(source, /selectedCandidateIds/);
  assert.doesNotMatch(source, /assignSelectedTaskCandidates/);
  assert.match(source, /reviewAssignment/);
  assert.doesNotMatch(source, /审核通过后，后台给账号分配测试任务/);

  assert.match(apiSource, /export interface MamaResourceTask/);
  assert.match(apiSource, /matchCategories\?: string\[\];/);
  assert.match(apiSource, /matchRiskTags\?: string\[\];/);
  assert.match(apiSource, /trafficFeeCents\?: number \| null;/);
  assert.match(apiSource, /claimLimit\?: number \| null;/);
  assert.match(apiSource, /remainingClaimCount\?: number \| null;/);
  assert.match(apiSource, /claimMamaResourceTask: \(id: string\)/);
  assert.match(apiSource, /minFollowerCount\?: number \| null;/);
  assert.match(apiSource, /exampleImageUrls\?: string\[\];/);
  assert.doesNotMatch(apiSource, /autoAssign\?: boolean;/);
  assert.match(apiSource, /export interface MamaResourceTaskAssignment/);
  assert.doesNotMatch(apiSource, /export interface MamaResourceTaskCandidate/);
  assert.match(apiSource, /getMamaResourceTasks: \(\)/);
  assert.match(apiSource, /createMamaResourceTask: \(data: MamaResourceTaskInput\)/);
  assert.match(apiSource, /updateMamaResourceTask: \(id: string, data: MamaResourceTaskInput\)/);
  assert.doesNotMatch(apiSource, /getMamaResourceTaskCandidates/);
  assert.doesNotMatch(apiSource, /assignMamaResourceTaskProfiles/);
  assert.match(apiSource, /reviewMamaResourceTaskAssignment/);
  assert.doesNotMatch(apiSource, /\/admin\/mama-resources\/tasks\/\$\{id\}\/candidates/);
  assert.match(apiSource, /\/admin\/mama-resources\/tasks\/assignments\/\$\{id\}\/review/);
  assert.match(backendSource, /router\.patch\("\/tasks\/:taskId"/);
  assert.match(backendSource, /buildTaskWritePayload\(req\.body, title\)/);
});

test("admin task content dispatch opens a current-task-only wide modal", () => {
  assert.match(source, />内容下发<\/button>/);
  assert.match(source, /aria-label="当前任务内容下发"/);
  assert.match(source, /max-w-\[min\(96vw,1440px\)\]/);
  assert.match(source, /只展示已经领取当前任务的账号/);
  assert.match(source, /用户筛选/);
  assert.doesNotMatch(source, /定向选择账号/);
  assert.match(source, /领取任务账号/);

  const modalStart = source.indexOf('aria-label="当前任务内容下发"');
  const modalEnd = source.indexOf("{contentImportOpen && contentImportPreview", modalStart);
  const modalSource = source.slice(modalStart, modalEnd);

  assert.doesNotMatch(modalSource, /上架新任务/);
  assert.doesNotMatch(modalSource, /已上架任务/);
  assert.doesNotMatch(modalSource, /openTaskCreate/);
  assert.doesNotMatch(modalSource, /openTaskEdit/);

  const taskListStart = source.indexOf(">任务列表<");
  const taskListEnd = source.indexOf("{isReviewMode ? <section", taskListStart);
  const taskListSource = source.slice(taskListStart, taskListEnd);
  assert.match(taskListSource, /onClick=\{\(\) => openTaskEdit\(task\)\}/);
});

test("admin task content dispatch only manages claimants with identity, tags, and order blocking", () => {
  assert.match(source, /只展示已经领取当前任务的账号/);
  assert.match(source, /ID \{assignment\.user\?\._id/);
  assert.match(source, /手机 \{assignment\.user\?\.mobile/);
  assert.match(source, /站内昵称/);
  assert.match(source, /平台昵称/);
  assert.match(source, /运营标签与接单权限/);
  assert.match(source, /保存标签/);
  assert.match(source, /禁止账号接单/);
  assert.match(source, /恢复账号接单/);
  assert.match(source, /taskOperatorTagFilter/);
  assert.match(source, /taskOrderBlockedFilter/);
  assert.match(apiSource, /operatorTags\?: string\[\];/);
  assert.match(apiSource, /orderBlocked\?: boolean;/);
  assert.match(apiSource, /userId\?: string;/);
  assert.match(apiSource, /user\?: \{/);
  assert.match(apiSource, /updateMamaResourceOperations/);
  assert.match(apiSource, /\/admin\/mama-resources\/\$\{id\}\/operations/);
  assert.match(backendSource, /只能下发给已经领取该任务的账号/);
  assert.match(backendSource, /账号尚未领取该任务/);
});

test("admin mama resources detail editing is handled in a modal instead of a right rail", () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /closeEdit/);
  assert.match(source, /编辑资源详情/);
  assert.match(source, /rounded-full[^>]*>[\s\S]*?查看\s*<\/button>/);
  assert.doesNotMatch(source, /xl:grid-cols-\[1fr_420px\]/);
  assert.doesNotMatch(source, /选择一条资源后，可以补充账号基础数据/);
});

test("admin mama resource profiles mask Alipay accounts in lists and edit full settlement details", () => {
  assert.match(source, /function maskAlipayAccount\(value: string \| undefined\)/);
  assert.match(source, /maskAlipayAccount\(profile\.alipayAccount\)/);
  assert.match(source, /setManualAlipayAccount\(profile\.alipayAccount \|\| ""\)/);
  assert.match(source, /setManualAlipayVerifiedName\(profile\.alipayVerifiedName \|\| ""\)/);
  assert.match(source, /alipayAccount: manualAlipayAccount\.trim\(\)/);
  assert.match(source, /alipayVerifiedName: manualAlipayVerifiedName\.trim\(\)/);
  assert.match(source, /支付宝账号[\s\S]*value=\{manualAlipayAccount\}/);
  assert.match(source, /支付宝验证姓名[\s\S]*value=\{manualAlipayVerifiedName\}/);
});

test("admin mama resource review edits and saves every submitted media account", () => {
  assert.match(source, /manualMediaAccounts/);
  assert.match(source, /profile\.mediaAccounts\?\.length[\s\S]*profile\.socialAccount/);
  assert.match(source, /manualMediaAccounts\.map\(\(account, index\) =>/);
  assert.match(source, /账号 \{index \+ 1\}/);
  assert.match(source, /account\.platform/);
  assert.match(source, /account\.profileUrl/);
  assert.match(source, /updateManualMediaAccount\(index, "nickname"/);
  assert.match(source, /updateManualMediaAccount\(index, "followerCount"/);
  assert.match(source, /const mediaAccounts = manualMediaAccounts\.map/);
  assert.match(source, /mediaAccounts,[\s\S]*socialAccount: primaryXiaohongshuAccount/);
  assert.match(source, /function extractProfileUrl\(value\?: string\)/);
  assert.match(source, /match\(\/https\?:\\\/\\\/\[\^\\s<>/);
  assert.match(source, /href=\{extractProfileUrl\(account\.profileUrl\)\}/);
});

test("admin task assignments support manual and previewed personal content link imports", () => {
  assert.match(source, /已领取 \{assignments\.length\} 人 · 已配置内容 \{configuredContentCount\}\/\{assignments\.length\}/);
  assert.match(source, /const \[selectedAssignmentId, setSelectedAssignmentId\] = useState\(""\)/);
  assert.match(source, /const selectedAssignment = assignments\.find/);
  assert.match(source, /xl:grid-cols-\[minmax\(220px,3fr\)_minmax\(0,7fr\)\]/);
  assert.match(source, /aria-label="领取任务账号列表"/);
  assert.match(source, /aria-label="领取任务账号详情"/);
  assert.match(source, /onClick=\{\(\) => selectAssignment\(assignment\)\}/);
  assert.match(source, /!selectedAssignment \? \(/);
  assert.match(source, /请选择账号/);
  assert.match(source, /点击左侧领取账号后，在这里查看身份信息、打标签并配置专属链接/);
  assert.match(source, /专属内容链接/);
  assert.match(source, /saveAssignmentContentUrl/);
  assert.match(source, /aria-label="导入专属链接"/);
  assert.match(source, /选择 Excel 文件/);
  assert.match(source, /下载导入模板/);
  assert.match(source, /downloadContentImportTemplate[^>]*className="inline-flex h-9 items-center justify-center whitespace-nowrap/);
  assert.match(source, /<label className=\{`inline-flex h-9 items-center justify-center whitespace-nowrap[^`]*`\}>[\s\S]*选择 Excel 文件/);
  assert.match(source, /previewMamaResourceContentImport/);
  assert.match(source, /commitMamaResourceContentImport/);
  assert.match(source, /确认导入/);
  assert.doesNotMatch(source, /短信|已发送短信/);

  assert.match(apiSource, /contentUrl\?: string;/);
  assert.match(apiSource, /contentUpdatedAt\?: string \| null;/);
  assert.match(apiSource, /downloadMamaResourceContentImportTemplate/);
  assert.match(apiSource, /updateMamaResourceAssignmentContent/);
  assert.match(apiSource, /previewMamaResourceContentImport/);
  assert.match(apiSource, /commitMamaResourceContentImport/);
});

test("admin task content dispatch supports an ordered link pool with waiting state", () => {
  assert.match(source, /const \[contentLinkImportOpen, setContentLinkImportOpen\] = useState\(false\)/);
  assert.match(source, /onClick=\{\(\) => setContentLinkImportOpen\(true\)\}/);
  assert.match(source, />导入链接<\/button>/);
  assert.doesNotMatch(source, /批量链接池/);
  assert.doesNotMatch(source, /批量导入专属链接/);
  assert.match(source, /contentLinkText/);
  assert.match(source, /导入并顺序分配/);
  assert.match(source, /链接按账号分配时间顺序绑定/);
  assert.match(source, /链接耗尽后任务自动暂停，补充链接后恢复/);
  assert.match(source, /等待内容分配/);
  assert.match(source, /contentLinkRemainingCount/);
  assert.match(source, /importMamaResourceContentLinks/);

  assert.match(apiSource, /contentLinkPoolEnabled\?: boolean;/);
  assert.match(apiSource, /pausedForContent\?: boolean;/);
  assert.match(apiSource, /contentLinkAssignedCount\?: number;/);
  assert.match(apiSource, /importMamaResourceContentLinks: \(id: string/);
  assert.match(apiSource, /\/admin\/mama-resources\/tasks\/\$\{id\}\/content-links/);
  assert.match(backendSource, /router\.post\("\/tasks\/:taskId\/content-links"/);
  assert.match(backendSource, /parseMamaResourceContentLinks/);
  assert.match(backendSource, /distributeMamaResourceContentLinks/);
});

test("admin task assignments upload and replace transfer screenshots", () => {
  assert.match(apiSource, /transferScreenshotUrl\?: string;/);
  assert.match(apiSource, /transferScreenshotUpdatedAt\?: string \| null;/);
  assert.match(apiSource, /updateMamaResourceAssignmentTransferScreenshot/);
  assert.match(apiSource, /assignments\/\$\{id\}\/transfer-screenshot/);
  assert.match(source, /transferScreenshotUploadingId/);
  assert.match(source, /handleTransferScreenshotUpload/);
  assert.match(source, /adminApi\.uploadAdminImage\(file\)/);
  assert.match(source, /上传转账截图/);
  assert.match(source, /替换截图/);
  assert.match(source, /任务转账凭证/);
});

test("admin task assignments mark and filter proof screenshot return status", () => {
  assert.match(source, /全部返图状态/);
  assert.match(source, /已返图/);
  assert.match(source, /未返图/);
  assert.match(source, /24小时未返图/);
  assert.match(source, /用户筛选/);
  assert.match(source, /aria-label="返图状态快捷筛选"/);
  assert.doesNotMatch(source, /aria-label="返图状态筛选"/);
  assert.match(source, /proofStatusBadge/);
  assert.match(source, /filterTaskAssignmentsByProofStatus/);
  assert.match(apiSource, /proofStatus\?: MamaResourceProofStatus;/);
  assert.match(apiSource, /proofStatus\?: 'all' \| 'returned' \| 'missing' \| 'overdue'/);
  assert.match(backendSource, /proofStatus === "overdue"/);
  assert.match(backendSource, /24 \* 60 \* 60 \* 1000/);
});
