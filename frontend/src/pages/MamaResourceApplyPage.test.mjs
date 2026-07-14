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

function sourceFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1)
        .replaceAll(": MamaResourceTask[]", "")
        .replaceAll(": MamaResourceTask | null", "")
        .replaceAll(": MamaResourceTask", "")
        .replaceAll(": ProfileTaskRequest", "")
        .replaceAll(": AuthMutationRequest", "")
        .replaceAll(": boolean", "")
        .replaceAll(": string", "");
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function evaluateHelper(name) {
  return Function(`${sourceFunction(name)}; return ${name};`)();
}

test("mama resource application route is public and avoids account credentials", () => {
  assert.match(appSource, /import MamaResourceApplyPage from "\.\/pages\/MamaResourceApplyPage";/);
  assert.match(appSource, /if \(normalizedPathname === "\/mama-resources\/apply"\) \{\s*return <MamaResourceApplyPage \/>;\s*\}/s);
  assert.match(source, /妈妈好赚/);
  assert.doesNotMatch(source, /妈妈发稿资源池/);
  assert.match(source, /\/assets\/mama-hao-zhuan-icon\.png/);
  assert.match(source, /#5e17eb/);
  assert.doesNotMatch(source, /#eefaf5/);
  assert.doesNotMatch(source, /#fff7e8/);
  assert.match(source, /运营会按备注联系你。/);
  assert.match(staticSource, /后续任务派发。/);
  assert.match(source, /小红书主页链接/);
  assert.doesNotMatch(source, /历史案例链接/);
  assert.match(source, /不需要账号密码/);
  assert.doesNotMatch(source, /password/i);
});

test("mama resource application opens with the icon intro card before the form", () => {
  assert.match(source, /<div className="rounded-\[17px\][\s\S]*妈妈好赚[\s\S]*资料管理/);
  assert.match(source, /type ProfileManagerMode = "overview" \| "personal" \| "media" \| "preference";/);
  assert.match(source, /const \[profileManagerMode, setProfileManagerMode\] = useState<ProfileManagerMode>\("overview"\);/);
  assert.match(source, /profileManagerMode === "overview"[\s\S]*个人资料[\s\S]*社交媒体账号[\s\S]*接单偏好/);
  assert.match(source, /profileManagerMode === "personal"[\s\S]*保存个人信息/);
  assert.match(source, /profileManagerMode === "media"[\s\S]*保存社交媒体账号/);
  assert.match(source, /profileManagerMode === "preference"[\s\S]*保存接单偏好/);
  assert.match(source, /profileOverview/);
  assert.match(source, /保存并返回/);
  assert.match(source, /<h1 className="text-\[19px\][^"]*">资料管理<\/h1>/);
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
  assert.match(source, /import InlineLoginForm from "\.\.\/components\/InlineLoginForm";/);
  assert.match(source, /useSelector\(\(state: RootState\) => state\.user\)/);
  assert.match(source, /const loggedInMobile = String\(user\?\.mobile \|\| ""\)\.trim\(\);/);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*loggedInMobile[\s\S]*contactPhone: current\.contactPhone \|\| loggedInMobile[\s\S]*\}, \[loggedInMobile\]\);/);
  assert.match(source, /!\s*token \|\| !user \|\| requiresLogin \? \([\s\S]*<InlineLoginForm[\s\S]*onSuccess=\{handleLoginSuccess\}[\s\S]*\/>/);
  assert.doesNotMatch(source, /if \(!token \|\| !user\)[\s\S]*xf-show-login-modal/, "standalone apply page should render an inline login form instead of only dispatching a login prompt");
  assert.match(source, /displayName/);
  assert.match(source, /contactPhone/);
  assert.match(source, /contactWechat/);
  assert.match(source, /form\.contactWechat\.trim\(\) &&\s*form\.alipayAccount\.trim\(\) &&\s*form\.alipayVerifiedName\.trim\(\) &&\s*form\.xiaohongshuProfileUrl\.trim\(\)/);
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
  assert.match(source, /type MediaPlatform = "xiaohongshu" \| "douyin";/);
  assert.match(source, /type MediaAccountForm = \{[\s\S]*platform: MediaPlatform \| "";[\s\S]*nickname: string;[\s\S]*profileUrl: string;[\s\S]*followerCount: string;[\s\S]*realNameVerified: "" \| "yes" \| "no";[\s\S]*\};/);
  assert.match(source, /mediaAccounts: MediaAccountForm\[\];/);
  assert.match(source, /function blankMediaAccount\(\): MediaAccountForm/);
  assert.match(source, /添加新账号/);
  assert.match(source, /platformOptions\.map/);
  assert.match(source, /updateMediaAccount\(index, "nickname", event\.target\.value\)/);
  assert.match(source, /updateMediaAccount\(index, "profileUrl", event\.target\.value\)/);
  assert.match(source, /removeMediaAccount\(index\)/);
  assert.match(source, /mediaAccounts: buildSubmitMediaAccounts\(form\)/);
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
  assert.match(source, /alipayAccount: profile\.alipayAccount \|\| ""/);
  assert.match(source, /alipayVerifiedName: profile\.alipayVerifiedName \|\| ""/);
  assert.match(source, /支付宝账号[\s\S]*value=\{form\.alipayAccount\}/);
  assert.match(source, /支付宝验证姓名[\s\S]*value=\{form\.alipayVerifiedName\}/);
  assert.match(source, /form\.alipayAccount\.trim\(\)[\s\S]*form\.alipayVerifiedName\.trim\(\)/);
  assert.match(source, /alipayAccount: form\.alipayAccount\.trim\(\)/);
  assert.match(source, /alipayVerifiedName: form\.alipayVerifiedName\.trim\(\)/);
  assert.match(source, /publicApi\.submitMamaResourceApplication/);
});

test("mama resource public api posts applications", () => {
  assert.match(apiSource, /export interface MamaResourceApplicationInput/);
  assert.match(apiSource, /contactWechat: string;/);
  assert.match(apiSource, /contactPhone\?: string;/);
  assert.match(apiSource, /alipayAccount: string;/);
  assert.match(apiSource, /alipayVerifiedName: string;/);
  assert.match(apiSource, /xiaohongshuScreenshotUrl\?: string;/);
  assert.match(apiSource, /followerCount\?: number \| string;/);
  assert.match(apiSource, /realNameVerified\?: boolean \| null;/);
  assert.match(apiSource, /uploadMamaResourceScreenshot/);
  assert.match(apiSource, /api\.post<\{ url: string; filename: string \}>\('\/mama-resources\/uploads'/);
  assert.match(apiSource, /submitMamaResourceApplication: \(data: MamaResourceApplicationInput\)/);
  assert.match(apiSource, /api\.post<\{ profile: MamaResourceProfile \}>\('\/mama-resources\/applications', data\)/);
});

test("authenticated mama resource page hydrates profile and routes returned states", () => {
  assert.match(apiSource, /export interface MyMamaResourceTasksResponse/);
  assert.match(apiSource, /getMyMamaResourceTasks: \(\) =>\s*api\.get<MyMamaResourceTasksResponse>\('\/mama-resources\/me\/tasks'\)/);
  assert.match(source, /export type PageMode = "loading" \| "apply" \| "reviewing" \| "tasks" \| "detail" \| "error";/);
  assert.match(source, /publicApi\.getMyMamaResourceTasks\(\)/);
  assert.match(source, /nextProfile === null \? "apply" : nextProfile\.status === "approved" \? "tasks" : "reviewing"/);
  assert.match(source, /setTasks\(response\.data\.tasks \|\| \[\]\)/);
  assert.match(source, /setAvailableTasks\(response\.data\.availableTasks \|\| \[\]\)/);
  assert.match(source, /pageMode === "loading"[\s\S]*资料加载中/);
  assert.match(source, /pageMode === "error"[\s\S]*加载失败[\s\S]*onClick=\{loadProfileAndTasks\}[\s\S]*重新加载/);
  assert.match(source, /onSuccess=\{handleLoginSuccess\}/);
});

test("authentication transitions own loading without stale-token retry loops", () => {
  assert.match(source, /if \(error\?\.response\?\.status === 401\) \{\s*setRequiresLogin\(true\);\s*return;\s*\}/);
  assert.match(source, /const handleLoginSuccess = useCallback\(\(\) => undefined, \[\]\);/);
  assert.match(source, /profileTaskRequestRef\.current = \{ generation: profileTaskRequestRef\.current\.generation \+ 1, authIdentity \};[\s\S]*if \(!token \|\| !user\) return;\s*void loadProfileAndTasks\(\);/);
  assert.equal(source.match(/void loadProfileAndTasks\(\)/g)?.length, 1, "normal login should have one automatic loader trigger");
});

test("profile form hydration maps every editable profile field", () => {
  assert.match(source, /export function formStateFromProfile\(/);
  assert.match(source, /displayName: profile\.displayName \|\| ""/);
  assert.match(source, /contactPhone: profile\.contactPhone \|\| loggedInMobile/);
  assert.match(source, /xiaohongshuNickname: profile\.socialAccount\?\.nickname \|\| ""/);
  assert.match(source, /xiaohongshuProfileUrl: profile\.socialAccount\?\.profileUrl \|\| ""/);
  assert.match(source, /const extraAccounts = \(profile\.mediaAccounts \|\| \[\]\)\.filter[\s\S]*mediaAccounts: extraAccounts\.map/);
  assert.match(source, /blockedCategories: \(profile\.rateCard\?\.blockedCategories \|\| \[\]\)\.join\("、"\)/);
  assert.match(source, /consentAccepted: Boolean\(profile\.consentAccepted\)/);
});

test("reviewing profiles show status, review note, and profile management", () => {
  assert.match(source, /pageMode === "reviewing"[\s\S]*账号状态/);
  assert.match(source, /profileStatusLabel\(profile\.status\)/);
  assert.match(source, /profile\.reviewNote\?\.note/);
  assert.match(source, /资料管理/);
  assert.match(source, /setPageMode\("apply"\)/);
});

test("approved profiles render account home and complete task cards", () => {
  assert.match(source, /function MamaResourceAccountCard/);
  assert.match(source, /账号已通过/);
  assert.match(source, /资料管理/);
  assert.match(source, /function MamaResourceTaskCard/);
  assert.match(source, /任务单价/);
  assert.match(source, /投流补贴/);
  assert.match(source, /推广 \{promotionCountText\(task\)\} 人/);
  assert.match(source, /\{remainingCountText\(task\)\}/);
  assert.match(source, /task\.contentUrl \? <span[^>]*>内容已下发<\/span> : null/);
  assert.match(source, /暂时没有可接任务/);
  assert.match(source, /const assignedTaskIds = new Set\(tasks\.map\(taskIdentity\)\)/);
  assert.match(source, /availableTasks\.filter\(\(task\) => !assignedTaskIds\.has\(taskIdentity\(task\)\)\)/);
});

test("task identities keep template claims separate from assignment proof submissions", () => {
  const templateTaskIdentity = evaluateHelper("templateTaskIdentity");
  const assignmentTaskIdentity = evaluateHelper("assignmentTaskIdentity");
  const assignment = { _id: "assignment-a", taskId: "template-a" };
  assert.equal(templateTaskIdentity(assignment), "template-a");
  assert.equal(assignmentTaskIdentity(assignment), "assignment-a");
  assert.equal(templateTaskIdentity({ _id: "template-b" }), "template-b");
  assert.equal(assignmentTaskIdentity({ _id: "template-b" }), "");
  assert.match(source, /const initiatingTemplateId = templateTaskIdentity\(selectedTask\);[\s\S]*publicApi\.claimMamaResourceTask\(initiatingTemplateId\)/);
  assert.match(source, /publicApi\.submitMamaResourceTaskProof\(assignmentTaskIdentity\(selectedTask\), \{/);
});

test("task cards open an in-page detail with claim behavior", () => {
  assert.match(source, /function MamaResourceTaskDetail/);
  assert.match(source, /项目信息/);
  assert.match(source, /项目价格/);
  assert.match(source, /结算标准/);
  assert.match(source, /项目要求/);
  assert.match(source, /exampleImageUrls/);
  assert.match(source, /返回任务列表/);
  assert.match(source, /const \[selectedTask, setSelectedTask\] = useState<MamaResourceTask \| null>\(null\);/);
  assert.match(source, /publicApi\.claimMamaResourceTask\(initiatingTemplateId\)/);
  assert.match(source, /setSelectedTask\(claimedTask\)/);
  assert.match(source, /setPageMode\("detail"\)/);
});

test("assigned task detail exposes selectable content without embedding or navigating", () => {
  assert.match(source, /你的专属任务内容/);
  assert.match(source, /资料链接/);
  assert.match(source, /长按可复制：/);
  assert.match(source, /select-all/);
  assert.match(source, /task\.contentUrl\?\.trim\(\)/);
  assert.doesNotMatch(source, /<iframe/);
  assert.doesNotMatch(source, /window\.open\(task\.contentUrl|location\.href\s*=\s*task\.contentUrl/);
});

test("assigned task detail uploads and submits proof while preserving returned task state", () => {
  assert.match(source, /完成链接/);
  assert.match(source, /name="proofLink"/);
  assert.match(source, /type="file"[\s\S]*accept="image\/\*"/);
  assert.match(source, /publicApi\.uploadMamaResourceScreenshot\(file\)/);
  assert.match(source, /publicApi\.submitMamaResourceTaskProof\(assignmentTaskIdentity\(selectedTask\), \{\s*proofLink,\s*proofScreenshotUrl,?\s*\}\)/);
  assert.match(source, /提交回填/);
  assert.match(source, /setSelectedTask\(updatedTask\)/);
  assert.match(source, /setTasks\(\(current\) => current\.map/);
});

test("assigned task detail shows a read-only transfer credential when present", () => {
  assert.match(source, /task\.transferScreenshotUrl \? <div/);
  assert.match(source, /转账凭证/);
  assert.match(source, /href=\{task\.transferScreenshotUrl\}/);
  assert.match(source, /src=\{task\.transferScreenshotUrl\}/);
  assert.match(source, /alt="任务转账凭证"/);
});

test("proof async results only update the task that initiated the action", () => {
  const isSameTaskIdentity = evaluateHelper("isSameTaskIdentity");
  assert.equal(isSameTaskIdentity({ _id: "task-a" }, "task-a"), true);
  assert.equal(isSameTaskIdentity({ _id: "task-b" }, "task-a"), false);
  assert.equal(isSameTaskIdentity(null, "task-a"), false);
  assert.match(source, /const initiatingTaskId = taskIdentity\(selectedTask\);/);
  assert.match(source, /if \(!isSameTaskIdentity\(selectedTaskRef\.current, initiatingTaskId\)\) return;/);
  assert.match(source, /setTasks\(\(current\) => current\.map[\s\S]*if \(!isSameTaskIdentity\(selectedTaskRef\.current, initiatingTaskId\)\) return;/);
});

test("late claim results update lists but only update matching selected detail", () => {
  const shouldApplyTaskDetailResult = evaluateHelper("shouldApplyTaskDetailResult");
  assert.equal(shouldApplyTaskDetailResult({ _id: "template-a" }, "template-a"), true);
  assert.equal(shouldApplyTaskDetailResult({ _id: "template-b" }, "template-a"), false);
  assert.equal(shouldApplyTaskDetailResult(null, "template-a"), false);
  assert.match(source, /const initiatingTemplateId = templateTaskIdentity\(selectedTask\);/);
  assert.match(source, /const replacement = replaceClaimedTask[\s\S]*setAvailableTasks\(replacement\.availableTasks\);[\s\S]*if \(!shouldApplyTaskDetailResult\(selectedTaskRef\.current, initiatingTemplateId\)\) return;/);
});

test("profile task loads reject stale generations and changed auth identities", () => {
  const isCurrentProfileTaskRequest = evaluateHelper("isCurrentProfileTaskRequest");
  const current = { generation: 2, authIdentity: "token-b" };
  assert.equal(isCurrentProfileTaskRequest(current, { generation: 2, authIdentity: "token-b" }), true);
  assert.equal(isCurrentProfileTaskRequest(current, { generation: 1, authIdentity: "token-b" }), false);
  assert.equal(isCurrentProfileTaskRequest(current, { generation: 2, authIdentity: "token-a" }), false);
  assert.match(source, /if \(!isCurrentProfileTaskRequest\(profileTaskRequestRef\.current, request\)\) return;/);
  assert.match(source, /setLoadedAuthIdentity\(authIdentity\);\s*setLoadError[\s\S]*setPageMode\("error"\);/);
});

test("authenticated mutations reject late results after an account transition", () => {
  const isCurrentAuthMutation = evaluateHelper("isCurrentAuthMutation");
  const accountA = { generation: 1, authIdentity: "token-a" };
  const accountB = { generation: 2, authIdentity: "token-b" };
  assert.equal(isCurrentAuthMutation(accountA, accountA), true);
  assert.equal(isCurrentAuthMutation(accountB, accountA), false);
  assert.equal(isCurrentAuthMutation({ generation: 2, authIdentity: "token-a" }, accountA), false);
  assert.match(source, /if \(authMutationRef\.current\.authIdentity !== authIdentity\) \{\s*authMutationRef\.current = \{ generation: authMutationRef\.current\.generation \+ 1, authIdentity \};\s*\}/);
  assert.equal(source.match(/const mutation = authMutationRef\.current;/g)?.length, 5);
  assert.ok((source.match(/if \(!isCurrentAuthMutation\(authMutationRef\.current, mutation\)\) return;/g)?.length || 0) >= 10);
  assert.match(source, /setTaskClaiming\(false\);[\s\S]*setProofUploading\(false\);[\s\S]*setProofSubmitting\(false\);[\s\S]*setUploadingScreenshot\(false\);[\s\S]*setSubmitting\(false\);/);
});

test("content-link modal owns focus and supports Escape dismissal", () => {
  assert.match(source, /const contentLinkOpenerRef = useRef<HTMLButtonElement \| null>\(null\);/);
  assert.match(source, /const contentLinkCloseRef = useRef<HTMLButtonElement \| null>\(null\);/);
  assert.match(source, /contentLinkCloseRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key === "Tab"/);
  assert.match(source, /contentLinkOpenerRef\.current\?\.focus\(\)/);
  assert.match(source, /ref=\{contentLinkOpenerRef\}/);
  assert.match(source, /ref=\{contentLinkCloseRef\}/);
});

test("mama resource tasks expose assignment content URLs", () => {
  assert.match(apiSource, /export interface MamaResourceTask \{[\s\S]*contentUrl\?: string;/);
});

test("promotion count prefers the active assignment count", () => {
  const promotionCountText = evaluateHelper("promotionCountText");
  assert.equal(promotionCountText({ activePromotionCount: 0, promotionCount: 9 }), "0");
  assert.equal(promotionCountText({ activePromotionCount: 3, promotionCount: 9 }), "3");
  assert.equal(promotionCountText({ promotionCount: 9 }), "9");
  assert.match(apiSource, /activePromotionCount\?: number;/);
});

test("zero traffic subsidy is omitted on cards and shown as a dash in detail", () => {
  const hasPositiveTrafficFee = evaluateHelper("hasPositiveTrafficFee");
  const trafficFeeDetailText = evaluateHelper("trafficFeeDetailText");
  assert.equal(hasPositiveTrafficFee({ trafficFeeCents: 0 }), false);
  assert.equal(hasPositiveTrafficFee({ trafficFeeCents: 250 }), true);
  assert.equal(trafficFeeDetailText({ trafficFeeCents: 0 }), "-");
  assert.equal(trafficFeeDetailText({ trafficFeeCents: 250 }), "¥2.50");
  assert.match(source, /hasPositiveTrafficFee\(task\) \? <div[^>]*>投流补贴/);
});

test("claim replacement removes the available duplicate and retains one task identity", () => {
  const replaceClaimedTask = evaluateHelper("replaceClaimedTask");
  const result = replaceClaimedTask(
    [{ _id: "assignment-old", taskId: "task-1", title: "old" }],
    [{ _id: "task-1", title: "available" }, { _id: "task-2", title: "other" }],
    { _id: "assignment-new", taskId: "task-1", title: "claimed" },
  );
  assert.deepEqual(result.tasks.map((task) => task.title), ["claimed"]);
  assert.deepEqual(result.availableTasks.map((task) => task._id), ["task-2"]);
});
