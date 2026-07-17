import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsSource = readFileSync(resolve(__dirname, "index.js"), "utf8");
const wxmlSource = readFileSync(resolve(__dirname, "index.wxml"), "utf8");
const wxssSource = readFileSync(resolve(__dirname, "index.wxss"), "utf8");

test("mini mama resource form marks every required field", () => {
  ["姓名/昵称", "微信号", "支付宝账号", "支付宝验证姓名", "账号昵称", "小红书主页链接"].forEach((label) => {
    assert.match(wxmlSource, new RegExp(`${label}<text class="xf-mama-required">\\*</text>`));
  });
  assert.match(wxmlSource, /<text class="xf-mama-required">\*<\/text>资料会用于任务匹配和运营联系/);
  assert.match(wxssSource, /\.xf-mama-required\s*\{[\s\S]*color:\s*#e11d48;/);
});

test("mama resource form keeps a logged-in account-scoped draft across page exits", () => {
  assert.match(jsSource, /MAMA_RESOURCE_APPLY_DRAFT_KEY/);
  assert.match(jsSource, /getApplyDraftStorageKey\(\)/);
  assert.match(jsSource, /if \(!getToken\(\)\) return "";/);
  assert.match(jsSource, /`\$\{MAMA_RESOURCE_APPLY_DRAFT_KEY\}:\$\{encodeURIComponent\(ownerId\)\}`/);
  assert.match(jsSource, /wx\.removeStorageSync\(MAMA_RESOURCE_APPLY_DRAFT_KEY\)/);
  assert.match(jsSource, /loadApplyDraft\(\)/);
  assert.match(jsSource, /saveApplyDraft\(/);
  assert.match(jsSource, /clearApplyDraft\(\)/);
  assert.match(jsSource, /buildLoggedOutMamaResourceState\(\)/);
  assert.match(jsSource, /onNativeSettingsLogout\(\)[\s\S]*clearApplyDraft\(\)[\s\S]*buildLoggedOutMamaResourceState\(\)/);
  assert.match(jsSource, /onLoad\(options = \{\}\)[\s\S]*loadApplyDraft\(\)/);
  assert.match(jsSource, /updateDraftField\(event\)/);
  assert.match(jsSource, /chooseXiaohongshuScreenshot\(\)[\s\S]*updatePageApplyDraft\(this, \{ xiaohongshuScreenshotUrl: String\(url \|\| ""\) \}\)/);
  assert.match(jsSource, /截图上传失败：服务器返回异常/);
  assert.match(jsSource, /data\.message \|\| `截图上传失败/);
  assert.match(jsSource, /error && error\.errMsg/);
  assert.match(jsSource, /submit\(event\)[\s\S]*clearApplyDraft\(\)/);

  assert.match(wxmlSource, /name="displayName"[^>]*value="\{\{formDraft\.displayName\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="alipayAccount"[^>]*value="\{\{formDraft\.alipayAccount\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="alipayVerifiedName"[^>]*value="\{\{formDraft\.alipayVerifiedName\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="xiaohongshuProfileUrl"[^>]*value="\{\{formDraft\.xiaohongshuProfileUrl\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="xiaohongshuProfileUrl"[^>]*disabled="\{\{formDraft\.originalXiaohongshuProfileUrl\}\}"/);
  assert.match(wxmlSource, /主页链接已锁定，保存时只更新昵称等资料。/);
  assert.match(wxmlSource, /name="followerCount"[^>]*value="\{\{formDraft\.followerCount\}\}"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /name="blockedCategories"[^>]*value="\{\{formDraft\.blockedCategories\}\}"[^>]*bindinput="updateDraftField"/);
  assert.doesNotMatch(wxmlSource, /checkbox-group name="consentAccepted"|请先勾选资料使用授权/);
  assert.match(wxmlSource, /资料会用于任务匹配和运营联系，可联系运营停用或更新。/);
});

test("mama resource demographics fill empty values from child archives", () => {
  assert.match(jsSource, /fillApplyDraftFromArchive\(loadApplyDraft\(\)\)/);
  assert.match(jsSource, /archiveCity = asText\(children\.find[\s\S]*children\.length > 1[\s\S]*city: archiveCity[\s\S]*childStage: "多孩家庭", childGender: ""/);
  assert.match(jsSource, /value\.includes\("孕产"\) \|\| value\.includes\("婴幼儿"\)[\s\S]*return "孕产\/婴幼儿"/);
  assert.match(jsSource, /allowsUnknownGender = asText\(child\.grade\)\.includes\("孕产"\)/);
  assert.match(jsSource, /childStage: archiveStage/);
  assert.match(jsSource, /childGender: allowsUnknownGender \? "" : child\.gender === "男" \? "男孩"/);
  assert.match(wxmlSource, /孩子档案[\s\S]*wx:if="\{\{hasArchiveChildren\}\}"[\s\S]*catchtap="openChildArchive"[\s\S]*\{\{archiveChildrenText\}\}[\s\S]*wx:else[\s\S]*catchtap="openChildCreate">添加孩子/);
  assert.doesNotMatch(wxmlSource, />城市<input|name="city"/);
  assert.match(wxssSource, /\.xf-mama-archive-link \{[\s\S]*border: 2rpx solid #cbb7f4;[\s\S]*border-radius: 22rpx/);
  assert.match(jsSource, /openChildCreate\(\)[\s\S]*this\.openSettings\(\)[\s\S]*settingsPanelView: "archive"[\s\S]*this\.loadArchivePanel\(\)[\s\S]*this\.addArchiveChild\(\)/);
  assert.match(jsSource, /buildArchiveChildrenState\(\)[\s\S]*archiveChildrenText[\s\S]*openChildArchive\(\)[\s\S]*this\.openSettings\(\)[\s\S]*settingsPanelView: "archive"[\s\S]*this\.loadArchivePanel\(\)/);
  assert.doesNotMatch(jsSource, /openChild(?:Create|Archive)\(\)[\s\S]{0,240}wx\.navigateTo/);
  assert.doesNotMatch(wxmlSource, /bindchange="selectChildStage"|catchtap="toggleChildGender"/);
});

test("mama resource form persists and submits required Alipay profile fields", () => {
  assert.match(jsSource, /alipayAccount: asText\(source\.alipayAccount\)\.trim\(\)/);
  assert.match(jsSource, /alipayVerifiedName: asText\(source\.alipayVerifiedName\)\.trim\(\)/);
  assert.match(jsSource, /alipayAccount: source\.alipayAccount \|\| ""/);
  assert.match(jsSource, /alipayVerifiedName: source\.alipayVerifiedName \|\| ""/);
  assert.match(jsSource, /alipayAccount: String\(values\.alipayAccount \|\| ""\)\.trim\(\)/);
  assert.match(jsSource, /alipayVerifiedName: String\(values\.alipayVerifiedName \|\| ""\)\.trim\(\)/);
  assert.match(jsSource, /draft\.alipayAccount \? `支付宝 \$\{draft\.alipayAccount\}`/);
  assert.match(jsSource, /draft\.alipayVerifiedName \? `验证姓名 \$\{draft\.alipayVerifiedName\}`/);
  assert.match(jsSource, /if \(!payload\.alipayAccount\)[\s\S]*请填写支付宝账号/);
  assert.match(jsSource, /if \(!payload\.alipayVerifiedName\)[\s\S]*请填写支付宝验证姓名/);
});

test("social account inputs invite pasted commands and short links without domain restrictions", () => {
  assert.match(wxmlSource, /name="xiaohongshuProfileUrl"[^>]*placeholder="可粘贴整段口令或主页短链接"/);
  assert.match(wxmlSource, /data-field="profileUrl"[^>]*placeholder="可粘贴整段口令或主页链接"/);
});

test("mama resource profile management is always available and separates personal and media data", () => {
  assert.match(wxmlSource, /创作能力[\s\S]*toggleContentCapability/);
  assert.match(jsSource, /CONTENT_CAPABILITY_OPTIONS = \["能拍", "能剪", "能写"\]/);
  assert.match(jsSource, /function buildContentCapabilityOptions\(contentCapabilities\)/);
  assert.match(jsSource, /contentCapabilities: Array\.isArray\(source\.contentCapabilities\)/);
  assert.match(wxmlSource, /item\.selected \? 'is-active' : ''/);
  assert.match(wxmlSource, /创作能力[\s\S]*class="xf-mama-chip \{\{item\.selected \? 'is-active' : ''\}\}"/);
  assert.doesNotMatch(wxmlSource, /contentCapabilities\.indexOf/);
  assert.match(jsSource, /MEDIA_PLATFORM_OPTIONS/);
  const platformOptions = jsSource.match(/const MEDIA_PLATFORM_OPTIONS = \[[\s\S]*?\n\];/)?.[0] || "";
  assert.match(platformOptions, /xiaohongshu/);
  assert.match(platformOptions, /douyin/);
  assert.doesNotMatch(platformOptions, /shipinhao|gongzhonghao|other/);
  assert.match(jsSource, /mediaAccounts/);
  assert.match(jsSource, /profileManagerMode: "overview"/);
  assert.match(jsSource, /openProfileManager\(\)/);
  assert.match(jsSource, /openPersonalInfoEditor\(\)/);
  assert.match(jsSource, /openMediaAccountsManager\(\)/);
  assert.match(jsSource, /openPreferenceEditor\(\)/);
  assert.match(jsSource, /saveCurrentProfileSectionAndBack\(\)/);
  assert.match(jsSource, /addMediaAccount\(\)/);
  assert.doesNotMatch(jsSource, /dataset && event\.currentTarget\.dataset\.platform/);
  const addMediaAccountSource = jsSource.match(/addMediaAccount\(\) \{[\s\S]*?\n  \},/)?.[0] || "";
  assert.match(addMediaAccountSource, /blankMediaAccount\(\)/);
  assert.doesNotMatch(addMediaAccountSource, /xiaohongshu/);
  assert.match(jsSource, /请选择平台/);
  assert.match(jsSource, /platformLogoText/);
  assert.match(jsSource, /platformLogoClass/);
  assert.match(jsSource, /platformLogoUrl/);
  assert.match(jsSource, /\/assets\/platform\/douyin-logo\.png/);
  assert.match(jsSource, /\/assets\/platform\/xiaohongshu-logo\.png/);
  assert.match(jsSource, /account\.profileUrl && account\.platform/);
  assert.match(jsSource, /updateMediaAccountField\(event\)/);
  assert.match(jsSource, /removeMediaAccount\(event\)/);
  assert.match(jsSource, /submitProfileDraft/);
  assert.match(jsSource, /submit\(event\)[\s\S]*mediaAccounts: buildSubmitMediaAccounts\(payload\)/);
  const normalizeExtraMediaAccounts = jsSource.match(/function normalizeExtraMediaAccounts\(value\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(normalizeExtraMediaAccounts, /return value\.map\(normalizeMediaAccount\);/);
  assert.doesNotMatch(normalizeExtraMediaAccounts, /\.filter/);

  assert.match(wxmlSource, /资料管理/);
  assert.doesNotMatch(wxmlSource, /自己的小红书账号/);
  assert.match(wxmlSource, /自己的社交媒体账号/);
  assert.match(wxmlSource, /小红书、抖音账号优先/);
  assert.match(wxmlSource, /xf-mama-profile-manager/);
  assert.match(wxmlSource, /profileManagerMode === 'overview'/);
  assert.match(wxmlSource, /class="xf-mama-info-list"/);
  assert.match(wxmlSource, /class="xf-mama-info-row is-personal"[\s\S]*个人资料/);
  assert.match(wxmlSource, /class="xf-mama-info-row is-media"[\s\S]*社交媒体账号/);
  assert.match(wxmlSource, /class="xf-mama-info-row is-preference"[\s\S]*接单偏好/);
  assert.ok(wxmlSource.indexOf('class="xf-mama-info-row is-preference"') < wxmlSource.indexOf('class="xf-mama-info-row is-personal"'));
  assert.match(wxmlSource, /catchtap="openNewMediaAccount"[^>]*>添加新平台账号<\/button>/);
  assert.match(jsSource, /openNewMediaAccount\(\)\s*\{[\s\S]*concat\(blankMediaAccount\(\)\)[\s\S]*updatePageApplyDraft\(this, \{ mediaAccounts \}\);[\s\S]*addingMediaAccountOnly: true[\s\S]*\}/);
  assert.match(jsSource, /openMediaAccountsManager\(\)\s*\{[\s\S]*addingMediaAccountOnly: false[\s\S]*\}/);
  assert.match(wxmlSource, /\{\{addingMediaAccountOnly \? "添加平台账号" : "社交媒体账号"\}\}/);
  assert.match(wxmlSource, /<block wx:if="\{\{!addingMediaAccountOnly\}\}">[\s\S]*小红书主页链接[\s\S]*<\/block>/);
  assert.match(wxmlSource, /hidden="\{\{addingMediaAccountOnly && index !== mediaAccounts\.length - 1\}\}" class="xf-mama-media-account"/);
  assert.match(wxssSource, /\.xf-mama-info-row\.is-personal \{/);
  assert.match(wxssSource, /\.xf-mama-info-row\.is-media \{/);
  assert.match(wxssSource, /\.xf-mama-info-row\.is-preference \{/);
  assert.match(wxmlSource, /catchtap="openPersonalInfoEditor"/);
  assert.match(wxmlSource, /catchtap="openMediaAccountsManager"/);
  assert.match(wxmlSource, /catchtap="openPreferenceEditor"/);
  assert.match(wxmlSource, /catchtap="submitProfileDraft"/);
  assert.match(wxmlSource, /catchtap="saveCurrentProfileSectionAndBack"/);
  assert.match(wxmlSource, /<view class="xf-mama-editor-back" catchtap="saveCurrentProfileSectionAndBack" role="button">保存并返回<\/view>/);
  assert.doesNotMatch(wxmlSource, /<button type="button" class="xf-mama-editor-back"/);
  assert.match(wxmlSource, /profileManagerMode === 'media'[\s\S]*<view wx:if="\{\{message\}\}" class="xf-mama-message \{\{messageType\}\}">\{\{message\}\}<\/view>[\s\S]*保存社交媒体账号/);
  assert.match(wxmlSource, /保存资料/);
  assert.doesNotMatch(wxmlSource, /进入待审核|资料使用授权/);
  assert.match(wxmlSource, /个人信息/);
  assert.match(wxmlSource, /媒体账号/);
  assert.match(wxmlSource, /wx:for="\{\{mediaAccounts\}\}"/);
  assert.match(wxmlSource, /xf-mama-platform-logo/);
  assert.match(wxmlSource, /\{\{item\.platformLogoClass\}\}/);
  assert.match(wxmlSource, /<image[^>]*class="xf-mama-platform-logo-image"[^>]*src="\{\{item\.platformLogoUrl\}\}"/);
  assert.match(wxmlSource, /\{\{item\.platformLogoText\}\}/);
  assert.match(wxmlSource, /data-field="profileUrl"[^>]*bindinput="updateMediaAccountField"/);
  assert.match(wxmlSource, /账号昵称<text class="xf-mama-required">\*<\/text><input name="xiaohongshuNickname"[^>]*value="\{\{formDraft\.xiaohongshuNickname\}\}"[^>]*data-field="xiaohongshuNickname"[^>]*bindinput="updateDraftField"/);
  assert.match(wxmlSource, /账号昵称<text class="xf-mama-required">\*<\/text><input value="\{\{item\.nickname\}\}"[^>]*placeholder="必填"/);
  assert.match(wxmlSource, /<text>\{\{item\.nickname \|\| item\.platformLabel \+ "账号"\}\}<\/text>/);
  assert.doesNotMatch(wxmlSource, /item\.platformLabel\}\}账号 \{\{index \+ 2\}\}/);
  assert.match(wxmlSource, /catchtap="addMediaAccount"[^>]*>添加新账号<\/button>/);
  assert.doesNotMatch(wxmlSource, /添加小红书账号|添加抖音账号|data-platform=/);
  assert.doesNotMatch(wxmlSource, /视频号|公众号|其他/);
  assert.match(wxssSource, /\.xf-mama-platform-logo\.is-xiaohongshu \{/);
  assert.match(wxssSource, /\.xf-mama-platform-logo\.is-douyin \{/);
  assert.match(wxssSource, /\.xf-mama-platform-logo\.is-unselected \{/);
  assert.match(wxssSource, /\.xf-mama-platform-logo-image \{/);
  assert.ok(existsSync(resolve(__dirname, "../../assets/platform/douyin-logo.png")));
  assert.ok(existsSync(resolve(__dirname, "../../assets/platform/xiaohongshu-logo.png")));
  assert.match(wxmlSource, /catchtap="removeMediaAccount"/);
  assert.match(wxmlSource, /mamaResourceView === 'tasks'[\s\S]*资料管理/);
  assert.match(wxmlSource, /mamaResourceView === 'reviewing'[\s\S]*资料管理/);

  assert.match(jsSource, /xiaohongshuNickname: ""/);
  assert.match(jsSource, /originalXiaohongshuProfileUrl: ""/);
  assert.match(jsSource, /originalXiaohongshuProfileUrl: primary\.profileUrl \|\| ""/);
  assert.match(jsSource, /const lockedXiaohongshuProfileUrl = asText\(draft\.originalXiaohongshuProfileUrl\)\.trim\(\);/);
  assert.match(jsSource, /xiaohongshuProfileUrl: lockedXiaohongshuProfileUrl \|\| draft\.xiaohongshuProfileUrl/);
  assert.match(wxssSource, /\.xf-mama-field input\.is-locked \{/);
  assert.match(wxssSource, /\.xf-mama-field input,[\s\S]*\.xf-mama-picker \{[\s\S]*text-align: center;/);
  assert.match(wxssSource, /\.xf-mama-field textarea \{[\s\S]*text-align: center;/);
  assert.match(jsSource, /nickname: draft\.xiaohongshuNickname/);
  assert.match(jsSource, /title: account\.nickname \|\| `\$\{account\.platformLabel \|\| "媒体"\}账号 \$\{index \+ 1\}`/);
  assert.match(jsSource, /summary: account\.platform === "xiaohongshu" \? "" :/);
  assert.match(wxmlSource, /<text wx:if="\{\{item\.summary\}\}" class="xf-mama-info-account-summary">\{\{item\.summary\}\}<\/text>/);
  assert.match(jsSource, /if \(!payload\.xiaohongshuNickname\)[\s\S]*请填写小红书账号昵称/);
  assert.match(jsSource, /findIndex\(\(account\) => !account\.nickname\)/);
  assert.match(jsSource, /请填写第\$\{missingNicknameIndex \+ 2\}个账号的账号昵称/);
});

test("approved mama resource account can view assigned tasks and submit proof", () => {
  assert.match(jsSource, /loadMamaTasks\(\)/);
  assert.match(jsSource, /url: "\/api\/mama-resources\/me\/tasks"/);
  assert.match(jsSource, /onNativeSettingsLoginSuccess\(payload\)/);
  assert.match(jsSource, /updatePageApplyDraft\(this, \{ contactPhone: mobile \}\)/);
  assert.match(jsSource, /applyStationUserProfile\(user\)/);
  assert.match(jsSource, /displayName: stationName/);
  assert.match(jsSource, /onNativeSettingsProfileSaved\(user\)/);
  assert.doesNotMatch(jsSource, /xiaohongshuNickname: stationName/);
  assert.match(jsSource, /onNativeSettingsLoginSuccess\(payload\)[\s\S]*return this\.loadMamaTasks\(\)/);
  assert.match(jsSource, /availableTasks/);
  assert.match(jsSource, /openMamaTask\(event\)/);
  assert.match(jsSource, /claimMamaTask\(\)/);
  assert.match(jsSource, /\/api\/mama-resources\/tasks\/\$\{taskId\}\/claims/);
  assert.match(jsSource, /chooseTaskProofScreenshot\(\)/);
  assert.match(jsSource, /proofScreenshotUrl/);
  assert.match(jsSource, /submitTaskProof\(\)/);
  assert.match(jsSource, /\/api\/mama-resources\/me\/tasks\/\$\{taskId\}\/submissions/);

  assert.match(wxmlSource, /mamaResourceView === 'tasks'/);
  assert.match(wxmlSource, /mamaResourceView === 'detail'/);
  assert.match(wxmlSource, /xf-mama-task-title[\s\S]*好赚/);
  assert.match(wxmlSource, /xf-mama-task-mascot[\s\S]*\/assets\/menu\/mama-hao-zhuan-icon\.png[\s\S]*mode="aspectFit"/);
  assert.doesNotMatch(wxmlSource, /任务列表|可领取与进行中的任务/);
  assert.match(wxmlSource, /资料管理[\s\S]*xf-mama-task-uid-row" catchtap="copyMamaUid"[\s\S]*UID \{\{mamaResourceProfile\.publicUid\}\}[\s\S]*xf-mama-task-copy-icon/);
  assert.match(wxssSource, /\.xf-mama-task-uid-label\s*\{[^}]*padding:\s*0;/);
  assert.match(wxssSource, /\.xf-mama-task-uid-label\s*\{[^}]*font-weight:\s*400;/);
  assert.match(wxssSource, /\.xf-mama-task-uid-copy\s*\{[^}]*background:\s*transparent;/);
  assert.match(wxssSource, /\.xf-mama-task-uid-copy\s*\{[^}]*align-items:\s*center;/);
  assert.match(jsSource, /copyMamaUid\(\)[\s\S]*copyTextSilently\(this\.data\.mamaResourceProfile/);
  assert.doesNotMatch(wxmlSource, /xf-mama-task-hero-icon/);
  assert.match(wxssSource, /\.xf-mama-task-identity\s*\{[\s\S]*flex-direction:\s*column;/);
  assert.match(wxmlSource, /xf-mama-task-logo[\s\S]*\/assets\/menu\/mama-hao-zhuan-icon\.png/);
  assert.match(wxmlSource, /xf-mama-task-price-label[\s\S]*任务单价/);
  assert.match(wxmlSource, /xf-mama-task-price-group[\s\S]*任务单价[\s\S]*\{\{item\.unitPriceText\}\}[\s\S]*class="xf-mama-task-traffic">投流补贴 \{\{item\.trafficFeeText\}\}/);
  assert.match(wxmlSource, /class="xf-mama-task-stats"[\s\S]*推广 \{\{item\.promotionCountText\}\} 人/);
  assert.match(wxssSource, /\.xf-mama-task-stats \{[\s\S]*margin-left: 90rpx;/);
  assert.match(wxmlSource, /项目价格/);
  assert.match(wxmlSource, /价格[\s\S]*投流补贴[\s\S]*结算周期/);
  assert.match(wxmlSource, /\{\{currentMamaTask\.hasTrafficFee \? currentMamaTask\.trafficFeeText : "-"\}\}/);
  assert.doesNotMatch(wxmlSource, /数据周期/);
  assert.doesNotMatch(wxmlSource, /xf-mama-cost-row/);
  assert.match(wxmlSource, /xf-mama-project-title[\s\S]*项目信息/);
  assert.match(wxmlSource, /xf-mama-example-gallery/);
  assert.match(wxmlSource, /catchtap="previewTaskExampleImage"/);
  assert.match(wxmlSource, /catchtap="claimMamaTask"/);
  assert.match(wxmlSource, /立即领取/);
  assert.match(jsSource, /exampleImageUrls: Array\.isArray\(source\.exampleImageUrls\)/);
  assert.match(jsSource, /trafficFeeCents/);
  assert.match(jsSource, /previewTaskExampleImage\(event\)/);
  assert.doesNotMatch(wxmlSource, /推广流程/);
  assert.doesNotMatch(wxmlSource, /最新数据/);
  assert.doesNotMatch(jsSource, /latestDataDateText/);
  assert.match(jsSource, /function formatDateText\(value\)/);
  assert.match(wxmlSource, /提交回填/);
  assert.match(wxmlSource, /上传完成截图/);
  assert.match(wxmlSource, /wx:if="\{\{!currentMamaTask\.isClaimable && !currentMamaTask\.hasContentUrl\}\}"[\s\S]*已领取，等待运营下发/);
  assert.match(wxmlSource, /wx:if="\{\{!currentMamaTask\.isClaimable && currentMamaTask\.hasContentUrl\}\}"[^>]*class="xf-mama-proof-card"/);
  assert.match(wxmlSource, /placeholder="粘贴笔记内容"/);
  assert.match(wxmlSource, /此操作只是领取任务。领取后请等待运营下发具体内容链接并完成审核/);
  assert.match(wxssSource, /\.xf-mama-proof-card \{[\s\S]*padding: 6rpx 24rpx 28rpx;/);
  assert.match(wxssSource, /\.xf-mama-proof-card \.xf-mama-section-title \{[\s\S]*padding-left: 0;[\s\S]*padding-right: 0;/);
});

test("assigned users can tap the personal content link to copy it silently", () => {
  assert.match(jsSource, /const contentUrl = asText\(source\.contentUrl\)\.trim\(\)/);
  assert.match(jsSource, /hasContentUrl: Boolean\(contentUrl\)/);
  assert.match(jsSource, /taskContentLinkOpen: false/);
  assert.match(jsSource, /openMamaTaskContent\(\) \{[\s\S]*this\.setData\(\{ taskContentLinkOpen: true \}\);[\s\S]*closeMamaTaskContent\(\) \{[\s\S]*this\.setData\(\{ taskContentLinkOpen: false \}\);/);
  const openHandler = jsSource.match(/openMamaTaskContent\(\) \{([\s\S]*?)\n  \},\n\n  closeMamaTaskContent/);
  assert.ok(openHandler);
  assert.doesNotMatch(openHandler[1], /wx\.navigateTo|wx\.setClipboardData/);
  assert.match(wxmlSource, /wx:if="\{\{item\.hasContentUrl\}\}"[^>]*>内容已下发</);
  assert.match(wxmlSource, /wx:if="\{\{currentMamaTask\.hasContentUrl\}\}"/);
  assert.match(wxmlSource, /catchtap="openMamaTaskContent"/);
  assert.match(wxmlSource, /打开专属内容/);
  assert.match(wxmlSource, /wx:if="\{\{taskContentLinkOpen\}\}"[^>]*class="xf-mama-dialog-mask"/);
  assert.match(wxmlSource, />资料链接</);
  assert.doesNotMatch(wxmlSource, /长按可复制/);
  assert.match(wxmlSource, /user-select="true"[^>]*catchtap="copyMamaTaskContentLink"[^>]*>\{\{currentMamaTask\.contentUrl\}\}<\/text>/);
  assert.match(jsSource, /copyMamaTaskContentLink\(\) \{[\s\S]*copyTextSilently\(this\.data\.currentMamaTask && this\.data\.currentMamaTask\.contentUrl\);/);
  assert.match(wxmlSource, /catchtap="closeMamaTaskContent"/);
  assert.match(wxssSource, /\.xf-mama-content-link-dialog \{/);
  assert.match(wxssSource, /\.xf-mama-content-link-value \{[\s\S]*user-select: text;/);
  assert.doesNotMatch(wxmlSource, /短信|已发送短信/);
});

test("assigned users can preview a read-only transfer credential", () => {
  assert.match(jsSource, /transferScreenshotUrl: normalizeMamaResourceImageUrl\(source\.transferScreenshotUrl\)/);
  assert.match(jsSource, /previewTransferScreenshot\(\)[\s\S]*wx\.previewImage\(\{ current, urls: \[current\] \}\)/);
  assert.match(wxmlSource, /wx:if="\{\{currentMamaTask\.hasContentUrl && currentMamaTask\.transferScreenshotUrl\}\}"[\s\S]*转账凭证/);
  assert.match(wxmlSource, /src="\{\{currentMamaTask\.transferScreenshotUrl\}\}"[^>]*catchtap="previewTransferScreenshot"/);
  assert.match(wxmlSource, /class="xf-mama-proof-card"[\s\S]*完成链接[\s\S]*class="xf-mama-transfer-card"[\s\S]*转账凭证/);
  assert.doesNotMatch(wxmlSource, /class="xf-mama-transfer-card"[\s\S]*转账凭证[\s\S]*class="xf-mama-proof-card"/);
});

test("logged-out mama resource users see the apply form and authorize on protected actions", () => {
  assert.match(jsSource, /const \{ getToken, getUser \} = require\("\.\.\/\.\.\/utils\/session"\)/);
  assert.match(jsSource, /function isUnauthorizedError\(error\)/);
  assert.match(jsSource, /mamaResourceView: "apply"/);
  assert.match(jsSource, /if \(!getToken\(\)\) \{/);
  assert.match(jsSource, /isUnauthorizedError\(error\)/);
  assert.match(jsSource, /mamaResourceView: "apply"[\s\S]*isLoggedIn: false/);
  assert.doesNotMatch(wxmlSource, /mamaResourceView === 'login'/);
  assert.match(wxmlSource, /<phone-login-gate[^>]*visible="\{\{false\}\}"[^>]*bind:success="handleLoginSuccess"/);
  assert.match(wxmlSource, /open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"/);
});

test("mama resource task share image includes a direct mini-program qrcode", () => {
  assert.match(jsSource, /openMamaTaskSharePoster\(\)/);
  assert.match(jsSource, /const pendingMamaTaskId = asText\(options\.taskId \|\| parseSceneParam\(options\.scene, "m"\)\)\.trim\(\)/);
  assert.doesNotMatch(jsSource, /ensureBackStackForBackButtonPage/);
  assert.match(jsSource, /mamaTaskShareQrUrl\(taskId\)/);
  assert.match(jsSource, /currentMiniProgramEnvVersion\(\)/);
  assert.match(jsSource, /envVersion=\$\{encodeURIComponent\(envVersion\)\}/);
  assert.match(jsSource, /responseType: "arraybuffer"/);
  assert.match(jsSource, /arrayBufferJsonMessage\(res && res\.data\)/);
  assert.match(jsSource, /wx\.getFileSystemManager\(\)/);
  assert.match(jsSource, /resolveCanvasImagePath\(task\.exampleImageUrls && task\.exampleImageUrls\[0\]\)/);
  assert.match(jsSource, /drawMamaTaskShareImage\(task, qrPath, examplePath\)/);
  assert.match(jsSource, /drawText\("项目信息"/);
  assert.match(jsSource, /drawText\("项目价格"/);
  assert.match(jsSource, /drawText\("结算标准"/);
  assert.match(jsSource, /drawText\("项目要求"/);
  assert.match(jsSource, /function canvasPosterTextWidth\(ctx, text, fontSize\)/);
  assert.match(jsSource, /function fitPosterText\(ctx, text, maxWidth, fontSize\)/);
  assert.match(jsSource, /const drawFittedText = \(text, x, y, maxWidth, fontSize, color, bold\)/);
  assert.match(jsSource, /\[286, 430, 560\]\.forEach/);
  assert.match(jsSource, /drawFittedText\(category, 74, 522, 194, 21, "#151222", true\)/);
  assert.match(jsSource, /function drawPosterRoundRect\(ctx, x, y, width, height, radius\)/);
  assert.match(jsSource, /drawPosterRoundRect\(ctx, 28, 38, 694, 1584, 28\)/);
  assert.match(jsSource, /drawPosterRoundRect\(ctx, 48, 206, 654, 64, 12\)/);
  assert.match(jsSource, /drawImage\(examplePath, 56, 948, 638, 380\)/);
  assert.match(jsSource, /drawImage\(qrPath, 305, 1396, 140, 140\)/);
  assert.match(jsSource, /drawText\("扫码直达任务，领取后参与", 375, 1572, 24, "#667085"/);
  assert.match(jsSource, /wx\.canvasToTempFilePath/);
  assert.match(jsSource, /height: 1660,[\s\S]*destHeight: 3320/);
  assert.match(jsSource, /saveMamaTaskShareImage\(\)/);
  assert.match(jsSource, /parseSceneParam\(options\.scene, "m"\)/);
  assert.match(wxmlSource, /<canvas[^>]*canvas-id="mamaTaskShareCanvas"[^>]*width="750"[^>]*height="1660"/);
  assert.match(wxmlSource, /class="xf-mama-detail-share-icon"[^>]*catchtap="openMamaTaskSharePoster"/);
  assert.doesNotMatch(wxmlSource, /生成分享图/);
  assert.match(wxmlSource, /taskSharePreviewOpen/);
  assert.match(wxssSource, /\.xf-mama-detail-share-icon \{/);
  assert.match(wxssSource, /\.xf-mama-share-canvas \{[\s\S]*width: 750px;[\s\S]*height: 1660px;/);
});

test("mama resource task example images use native-loadable URLs without a fixed background frame", () => {
  assert.match(jsSource, /function normalizeMamaResourceImageUrl\(value\)/);
  assert.match(jsSource, /source\.startsWith\("\/uploads\/"\)[\s\S]*buildUrl\(source\)/);
  assert.ok(jsSource.includes("xianfeng\\.xinzhi\\.info"));
  assert.ok(jsSource.includes('source.replace(/^http:/i, "https:")'));
  assert.match(jsSource, /exampleImageUrls: Array\.isArray\(source\.exampleImageUrls\) \? source\.exampleImageUrls\.map\(normalizeMamaResourceImageUrl\)\.filter\(Boolean\) : \[\]/);

  assert.match(wxmlSource, /class="xf-mama-example-image"[^>]*mode="widthFix"/);
  assert.doesNotMatch(wxmlSource, /class="xf-mama-example-image"[^>]*mode="aspectFit"/);
  const imageStyle = wxssSource.match(/\.xf-mama-example-image \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(imageStyle, /display: block;/);
  assert.match(imageStyle, /width: 100%;/);
  assert.doesNotMatch(imageStyle, /height:/);
  assert.doesNotMatch(imageStyle, /background:/);
});

test("mama resource profile saves directly without a review gate", () => {
  assert.doesNotMatch(jsSource, /profile\.status !== "approved"[\s\S]*mamaResourceView: "reviewing"/);
  assert.match(jsSource, /submitProfileDraft\(options = \{\}\)/);
  assert.match(jsSource, /saveCurrentProfileSectionAndBack\(\)[\s\S]*backToProfileOverview\(\)/);
  assert.match(jsSource, /savePersonalInfo\(event\)[\s\S]*请填写姓名\/昵称和微信号[\s\S]*backToProfileOverview\(\)/);
  assert.match(jsSource, /saveMediaAccounts\(\)[\s\S]*请填写小红书账号昵称[\s\S]*请填写小红书主页链接[\s\S]*backToProfileOverview\(\)/);
  assert.match(jsSource, /savePreferences\(event\)[\s\S]*backToProfileOverview\(\)/);
  assert.match(jsSource, /submitMamaResourcePayload\(payload, options = \{\}\)[\s\S]*请先填写姓名\/昵称、微信号和小红书主页链接/);
  assert.match(jsSource, /status: "approved"/);
  assert.match(jsSource, /mamaResourceView: "tasks"/);
  assert.match(jsSource, /资料已保存，运营会按备注跟进/);
  assert.match(jsSource, /if \(options\.stayInApply\)[\s\S]*mamaResourceView: "apply"[\s\S]*profileManagerMode: "overview"/);
  assert.match(jsSource, /readStoredUserMobile\(\)/);
  assert.match(jsSource, /contactPhone: storedDraft\.contactPhone \|\| userMobile/);

  assert.match(wxmlSource, /mamaResourceView === 'apply'/);
  assert.match(wxmlSource, /mamaResourceView === 'reviewing'/);
  assert.match(wxmlSource, /好赚/);
});

test("mama resource task loading errors do not force the application form", () => {
  assert.match(jsSource, /\.catch\(\(error\) => \{/);
  assert.match(jsSource, /任务状态加载失败，请稍后重试/);
  assert.match(jsSource, /messageType: "error"/);
  assert.doesNotMatch(jsSource, /\.catch\(\(_error\) => \{\s*this\.setData\(\{\s*mamaResourceView: "apply"/);
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

test("mama resource share card uses the Haozhuan page name", () => {
  assert.match(jsSource, /const MAMA_RESOURCE_SHARE_COVER_IMAGE = "\/assets\/share\/mama-hao-zhuan-cover\.png"/);
  assert.match(jsSource, /title: "好赚"/);
  assert.match(jsSource, /path: "\/pages\/mama-resource-apply\/index\?shared=1"/);
  assert.match(jsSource, /goBack\(\)[\s\S]*mamaResourceView === "detail"[\s\S]*backToMamaTasks\(\)[\s\S]*mamaResourceView === "apply" && profile\.status === "approved"[\s\S]*mamaResourceView: "tasks"[\s\S]*pages\.length > 1[\s\S]*wx\.navigateBack\(\{ delta: 1 \}\)[\s\S]*wx\.exitMiniProgram\(\)/);
  assert.match(jsSource, /imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE/);
  assert.doesNotMatch(jsSource, /好赚资料提交/);
});
