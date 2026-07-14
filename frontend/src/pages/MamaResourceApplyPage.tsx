import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import InlineLoginForm from "../components/InlineLoginForm";
import { publicApi } from "../services/api";
import type { MamaResourceProfile, MamaResourceTask } from "../services/api";
import type { RootState } from "../store";

const categoryOptions = ["亲子阅读", "学习用品", "母婴", "儿童健康", "家庭消费", "教育规划"];
const childStageOptions = ["孕产/婴幼儿", "幼儿园", "小学", "初中", "高中", "多孩家庭"];
const childGenderOptions = ["男孩", "女孩"];
const platformOptions = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音" },
] as const;
const realNameVerifiedOptions = [
  { value: "yes", label: "已实名" },
  { value: "no", label: "未实名" },
] as const;

type MediaPlatform = "xiaohongshu" | "douyin";
type ProfileManagerMode = "overview" | "personal" | "media" | "preference";
export type PageMode = "loading" | "apply" | "reviewing" | "tasks" | "detail" | "error";

type MediaAccountForm = {
  platform: MediaPlatform | "";
  nickname: string;
  profileUrl: string;
  followerCount: string;
  realNameVerified: "" | "yes" | "no";
};

type FormState = {
  displayName: string;
  contactPhone: string;
  contactWechat: string;
  city: string;
  childStage: string;
  childGender: string;
  xiaohongshuNickname: string;
  xiaohongshuProfileUrl: string;
  xiaohongshuScreenshotUrl: string;
  followerCount: string;
  realNameVerified: "" | "yes" | "no";
  mediaAccounts: MediaAccountForm[];
  accountPositioning: string;
  categories: string[];
  blockedCategories: string;
  consentAccepted: boolean;
};

function blankMediaAccount(): MediaAccountForm {
  return {
    platform: "",
    nickname: "",
    profileUrl: "",
    followerCount: "",
    realNameVerified: "",
  };
}

const initialForm: FormState = {
  displayName: "",
  contactPhone: "",
  contactWechat: "",
  city: "",
  childStage: "",
  childGender: "",
  xiaohongshuNickname: "",
  xiaohongshuProfileUrl: "",
  xiaohongshuScreenshotUrl: "",
  followerCount: "",
  realNameVerified: "",
  mediaAccounts: [],
  accountPositioning: "",
  categories: [],
  blockedCategories: "",
  consentAccepted: false,
};

export function formStateFromProfile(profile: MamaResourceProfile, loggedInMobile: string): FormState {
  const primaryProfileUrl = profile.socialAccount?.profileUrl || "";
  const extraAccounts = (profile.mediaAccounts || []).filter((account) =>
    (account.platform === "xiaohongshu" || account.platform === "douyin") &&
    account.profileUrl !== primaryProfileUrl
  );
  return {
    displayName: profile.displayName || "",
    contactPhone: profile.contactPhone || loggedInMobile,
    contactWechat: profile.contactWechat || "",
    city: profile.city || "",
    childStage: profile.childStage || "",
    childGender: profile.childGender || "",
    xiaohongshuNickname: profile.socialAccount?.nickname || "",
    xiaohongshuProfileUrl: profile.socialAccount?.profileUrl || "",
    xiaohongshuScreenshotUrl: profile.socialAccount?.screenshotUrl || "",
    followerCount: profile.socialAccount?.followerCount == null ? "" : String(profile.socialAccount.followerCount),
    realNameVerified: profile.socialAccount?.realNameVerified == null ? "" : profile.socialAccount.realNameVerified ? "yes" : "no",
    mediaAccounts: extraAccounts.map((account) => ({
      platform: account.platform === "xiaohongshu" || account.platform === "douyin" ? account.platform : "",
      nickname: account.nickname || "",
      profileUrl: account.profileUrl || "",
      followerCount: account.followerCount == null ? "" : String(account.followerCount),
      realNameVerified: account.realNameVerified == null ? "" : account.realNameVerified ? "yes" : "no",
    })),
    accountPositioning: profile.accountPositioning || "",
    categories: profile.categories || [],
    blockedCategories: (profile.rateCard?.blockedCategories || []).join("、"),
    consentAccepted: Boolean(profile.consentAccepted),
  };
}

function profileStatusLabel(status: MamaResourceProfile["status"]): string {
  if (status === "needs_info") return "待补充资料";
  if (status === "rejected") return "暂未通过";
  if (status === "approved") return "账号已通过";
  return "审核中";
}

function moneyText(value?: number | null): string {
  const cents = Number(value || 0);
  return cents > 0 ? `¥${(cents / 100).toFixed(2)}` : "待定";
}

function taskStatusText(status: MamaResourceTask["status"]): string {
  if (status === "listed") return "可领取";
  if (status === "submitted") return "待审核";
  if (status === "collected") return "已收录";
  if (status === "rejected") return "已驳回";
  return "进行中";
}

function promotionCountText(task: MamaResourceTask): string {
  const count = Number(task.promotionCount || 0);
  return count > 0 ? String(Math.floor(count)) : "待补";
}

function remainingCountText(task: MamaResourceTask): string {
  if (task.remainingClaimCount == null) return "不限名额";
  const count = Number(task.remainingClaimCount);
  if (!Number.isFinite(count)) return "不限名额";
  return count > 0 ? `剩余${Math.floor(count)}个名额` : "已领完";
}

function taskIdentity(task: MamaResourceTask): string {
  return String(task.taskId || task._id || "").trim();
}

function MamaResourceAccountCard({ profile, onManage }: { profile: MamaResourceProfile; onManage: () => void }) {
  return (
    <div className="grid grid-cols-[48px_1fr_auto] items-center gap-[11px] rounded-[18px] bg-white p-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
      <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-[48px] w-[48px] object-contain" />
      <div className="min-w-0">
        <div className="text-[11px] font-black text-[#7c2ce6]">账号已通过</div>
        <div className="mt-[2px] text-[17px] font-black text-[#151222]">妈妈好赚</div>
        <div className="mt-[3px] truncate text-[11.5px] font-bold text-[#6b6474]">{profile.displayName || "已审核账号"} · 可接：{profile.categories.length ? profile.categories.join("、") : "亲子阅读、学习用品"}</div>
      </div>
      <button type="button" onClick={onManage} className="rounded-full bg-[#f3eaff] px-[12px] py-[8px] text-[12px] font-black text-[#6c27d6]">资料管理</button>
    </div>
  );
}

function MamaResourceTaskCard({ task, onOpen }: { task: MamaResourceTask; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-[17px] border border-[#5e17eb]/10 bg-white p-[14px] text-left shadow-[0_7px_18px_rgba(94,23,235,0.07)]">
      <div className="grid grid-cols-[42px_1fr_auto] gap-[10px]">
        <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-[42px] w-[42px] object-contain" />
        <div className="min-w-0">
          <div className="text-[14px] font-black text-[#151222]">{task.title}</div>
          <div className="mt-[4px] text-[11.5px] font-bold text-[#6b6474]">{task.category || "小红书"} · {task.dataCycle || task.settlementCycle || "T+9"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-[#82798d]">任务单价</div>
          <div className="mt-[2px] text-[17px] font-black text-[#ee4d87]">{moneyText(task.unitPriceCents)}</div>
          <div className="mt-[2px] text-[10px] font-extrabold text-[#7c2ce6]">投流补贴 {moneyText(task.trafficFeeCents)}</div>
        </div>
      </div>
      <div className="mt-[12px] flex flex-wrap gap-[7px] text-[10.5px] font-extrabold text-[#655d70]">
        <span className="rounded-full bg-[#f3eaff] px-[9px] py-[5px] text-[#6c27d6]">{taskStatusText(task.status)}</span>
        <span className="rounded-full bg-[#f6f3f9] px-[9px] py-[5px]">推广 {promotionCountText(task)} 人</span>
        <span className="rounded-full bg-[#f6f3f9] px-[9px] py-[5px]">{remainingCountText(task)}</span>
        {task.contentUrl ? <span className="rounded-full bg-[#efe8ff] px-[9px] py-[5px] text-[#6c27d6]">内容已下发</span> : null}
      </div>
    </button>
  );
}

function MamaResourceTaskDetail({ task, claiming, claimError, onBack, onClaim }: { task: MamaResourceTask; claiming: boolean; claimError: string; onBack: () => void; onClaim: () => void }) {
  return (
    <div className="grid gap-[12px]">
      <button type="button" onClick={onBack} className="w-fit rounded-full bg-white px-[13px] py-[8px] text-[12px] font-black text-[#6c27d6]">‹ 返回任务列表</button>
      <div className="rounded-[18px] bg-white p-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
        <div className="flex items-center gap-[10px]">
          <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-[44px] w-[44px] object-contain" />
          <div><h2 className="text-[18px] font-black text-[#151222]">{task.title}</h2><p className="mt-[4px] text-[11.5px] font-bold text-[#6b6474]">{task.difficulty || "简单"} · {task.phase || "测试期"} · {task.category || "小红书"}</p></div>
        </div>
      </div>
      <div className="rounded-[18px] bg-white p-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
        <h3 className="text-[16px] font-black text-[#151222]">项目信息</h3>
        <h4 className="mt-[14px] text-[13px] font-black text-[#151222]">项目价格</h4>
        <div className="mt-[9px] grid grid-cols-3 gap-[8px] rounded-[12px] bg-[#faf8fd] p-[11px] text-center text-[11px] font-bold text-[#6b6474]">
          <div>任务单价<strong className="mt-[4px] block text-[14px] text-[#ee4d87]">{moneyText(task.unitPriceCents)}</strong></div>
          <div>投流补贴<strong className="mt-[4px] block text-[14px] text-[#151222]">{moneyText(task.trafficFeeCents)}</strong></div>
          <div>结算周期<strong className="mt-[4px] block text-[14px] text-[#151222]">{task.settlementCycle || "T+9"}</strong></div>
        </div>
        <div className="mt-[14px] border-t border-[#eee9f4] pt-[12px]"><div className="text-[13px] font-black">结算标准</div><p className="mt-[5px] text-[12px] font-semibold leading-[1.65] text-[#6b6474]">{task.settlementStandard || "按项目要求发布并保留，后台审核通过后结算。"}</p></div>
        <div className="mt-[12px] border-t border-[#eee9f4] pt-[12px]"><div className="text-[13px] font-black">项目要求</div><p className="mt-[5px] text-[12px] font-semibold leading-[1.65] text-[#6b6474]">{task.requirement || "提交小红书笔记链接和完成截图，否则无法结算。"}</p></div>
        {task.exampleImageUrls?.length ? <div className="mt-[10px] grid grid-cols-2 gap-[8px]">{task.exampleImageUrls.map((url) => <img key={url} src={url} alt="任务示例" className="w-full rounded-[10px] object-cover" />)}</div> : null}
        {task.claimable ? <button type="button" disabled={claiming} onClick={onClaim} className="mt-[15px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14px] font-black text-white disabled:bg-[#c8c2d3]">{claiming ? "领取中..." : "立即领取"}</button> : null}
        {claimError ? <p className="mt-[10px] text-[12px] font-bold text-[#be123c]">{claimError}</p> : null}
      </div>
    </div>
  );
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function parseFollowerCount(value: string): number | null {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function buildSubmitMediaAccounts(form: FormState) {
  const primary = {
    platform: "xiaohongshu" as const,
    nickname: form.xiaohongshuNickname.trim(),
    profileUrl: form.xiaohongshuProfileUrl.trim(),
    screenshotUrl: form.xiaohongshuScreenshotUrl,
    followerCount: parseFollowerCount(form.followerCount),
    realNameVerified: form.realNameVerified ? form.realNameVerified === "yes" : null,
  };
  const extras = form.mediaAccounts
    .filter((account): account is MediaAccountForm & { platform: MediaPlatform } =>
      Boolean(account.platform && account.nickname.trim() && account.profileUrl.trim())
    )
    .map((account) => ({
      platform: account.platform,
      nickname: account.nickname.trim(),
      profileUrl: account.profileUrl.trim(),
      followerCount: parseFollowerCount(account.followerCount),
      realNameVerified: account.realNameVerified ? account.realNameVerified === "yes" : null,
    }));
  return [primary, ...extras];
}

function buildProfileOverview(form: FormState) {
  const personalSummary = [
    form.displayName || "未填姓名/昵称",
    form.contactWechat ? `微信 ${form.contactWechat}` : "",
    form.contactPhone ? `手机 ${form.contactPhone}` : "",
  ].filter(Boolean).join(" · ");
  const accountCount = [
    form.xiaohongshuNickname || form.xiaohongshuProfileUrl || form.followerCount,
    ...form.mediaAccounts.map((account) => account.nickname || account.profileUrl || account.followerCount),
  ].filter(Boolean).length;
  const preferenceSummary = `${form.categories.length ? form.categories.join("、") : "未选择可发品类"}${form.blockedCategories ? ` · 暂不接：${form.blockedCategories}` : ""}`;
  return {
    personalSummary,
    mediaSummary: accountCount ? `${accountCount} 个媒体账号` : "未添加媒体账号",
    preferenceSummary,
    consentSummary: form.consentAccepted ? "已同意用于任务匹配和运营联系" : "待确认资料使用授权",
  };
}

const MamaResourceApplyPage: React.FC = () => {
  const { user, token } = useSelector((state: RootState) => state.user);
  const [form, setForm] = useState<FormState>(initialForm);
  const [profileManagerMode, setProfileManagerMode] = useState<ProfileManagerMode>("overview");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>("loading");
  const [profile, setProfile] = useState<MamaResourceProfile | null>(null);
  const [tasks, setTasks] = useState<MamaResourceTask[]>([]);
  const [availableTasks, setAvailableTasks] = useState<MamaResourceTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<MamaResourceTask | null>(null);
  const [taskClaiming, setTaskClaiming] = useState(false);
  const [taskClaimError, setTaskClaimError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const loggedInMobile = String(user?.mobile || "").trim();

  const loadProfileAndTasks = useCallback(async () => {
    setPageMode("loading");
    setLoadError("");
    try {
      const response = await publicApi.getMyMamaResourceTasks();
      const nextProfile = response.data.profile;
      setProfile(nextProfile);
      setTasks(response.data.tasks || []);
      setAvailableTasks(response.data.availableTasks || []);
      if (nextProfile) setForm(formStateFromProfile(nextProfile, loggedInMobile));
      else setForm({ ...initialForm, contactPhone: loggedInMobile });
      setRequiresLogin(false);
      setPageMode(nextProfile === null ? "apply" : nextProfile.status === "approved" ? "tasks" : "reviewing");
    } catch (error: any) {
      if (error?.response?.status === 401) {
        setRequiresLogin(true);
        return;
      }
      setLoadError(error?.response?.data?.message || error?.message || "资料加载失败，请稍后重试");
      setPageMode("error");
    }
  }, [loggedInMobile]);

  const handleLoginSuccess = useCallback(() => undefined, []);

  useEffect(() => {
    if (!token || !user) return;
    void loadProfileAndTasks();
  }, [token, user, loadProfileAndTasks]);

  useEffect(() => {
    if (!loggedInMobile) return;
    setForm((current) => ({
      ...current,
      contactPhone: current.contactPhone || loggedInMobile,
    }));
  }, [loggedInMobile]);

  const profileOverview = useMemo(() => buildProfileOverview(form), [form]);
  const visibleTasks = useMemo(() => {
    const assignedTaskIds = new Set(tasks.map(taskIdentity));
    return [...tasks, ...availableTasks.filter((task) => !assignedTaskIds.has(taskIdentity(task)))];
  }, [tasks, availableTasks]);

  const canSubmit = useMemo(() => {
    return Boolean(
      form.displayName.trim() &&
      form.contactWechat.trim() &&
      form.xiaohongshuProfileUrl.trim() &&
      form.xiaohongshuNickname.trim() &&
      form.consentAccepted &&
      !uploadingScreenshot &&
      !submitting
    );
  }, [form, submitting, uploadingScreenshot]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateMediaAccount = <K extends keyof MediaAccountForm>(index: number, key: K, value: MediaAccountForm[K]) => {
    setForm((current) => {
      const mediaAccounts = [...current.mediaAccounts];
      mediaAccounts[index] = { ...(mediaAccounts[index] || blankMediaAccount()), [key]: value };
      return { ...current, mediaAccounts };
    });
  };

  const addMediaAccount = () => {
    setForm((current) => ({ ...current, mediaAccounts: [...current.mediaAccounts, blankMediaAccount()] }));
  };

  const removeMediaAccount = (index: number) => {
    setForm((current) => ({
      ...current,
      mediaAccounts: current.mediaAccounts.filter((_item, itemIndex) => itemIndex !== index),
    }));
  };

  const saveCurrentProfileSectionAndBack = () => {
    setMessage("");
    setProfileManagerMode("overview");
  };

  const openTask = (task: MamaResourceTask) => {
    setSelectedTask(task);
    setTaskClaimError("");
    setPageMode("detail");
  };

  const claimSelectedTask = async () => {
    if (!selectedTask || taskClaiming) return;
    setTaskClaiming(true);
    setTaskClaimError("");
    try {
      const response = await publicApi.claimMamaResourceTask(taskIdentity(selectedTask));
      const claimedTask = response.data.task;
      const claimedId = taskIdentity(claimedTask);
      setTasks((current) => [...current.filter((task) => taskIdentity(task) !== claimedId), claimedTask]);
      setAvailableTasks((current) => current.filter((task) => taskIdentity(task) !== claimedId));
      setSelectedTask(claimedTask);
      setPageMode("detail");
    } catch (error: any) {
      setTaskClaimError(error?.response?.data?.message || error?.message || "领取失败，请稍后重试");
    } finally {
      setTaskClaiming(false);
    }
  };

  const handleScreenshotChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    setMessage("");
    try {
      const response = await publicApi.uploadMamaResourceScreenshot(file);
      updateField("xiaohongshuScreenshotUrl", response.data.url || "");
      setMessage("小红书页面截图已上传。");
      setSubmitted(true);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "截图上传失败，请稍后重试");
      setSubmitted(false);
    } finally {
      setUploadingScreenshot(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitted(false);
      setMessage("请先补齐个人资料、社交媒体账号，并勾选资料使用授权。");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await publicApi.submitMamaResourceApplication({
        displayName: form.displayName.trim(),
        contactPhone: form.contactPhone.trim(),
        contactWechat: form.contactWechat.trim(),
        city: form.city.trim(),
        childStage: form.childStage,
        childGender: form.childGender,
        xiaohongshuNickname: form.xiaohongshuNickname.trim(),
        xiaohongshuProfileUrl: form.xiaohongshuProfileUrl.trim(),
        xiaohongshuScreenshotUrl: form.xiaohongshuScreenshotUrl,
        followerCount: form.followerCount.trim(),
        realNameVerified: form.realNameVerified ? form.realNameVerified === "yes" : null,
        mediaAccounts: buildSubmitMediaAccounts(form),
        accountPositioning: form.accountPositioning.trim(),
        categories: form.categories,
        blockedCategories: form.blockedCategories,
        consentAccepted: form.consentAccepted,
      });
      setSubmitted(true);
      setProfileManagerMode("overview");
      setMessage("资料已提交，我们会先完成账号审核，再联系你确认适合的发稿机会。");
      await loadProfileAndTasks();
    } catch (error: any) {
      const nextMessage =
        error?.response?.data?.message ||
        error?.message ||
        "提交失败，请稍后重试";
      setSubmitted(false);
      setMessage(nextMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "mt-[6px] h-[39px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] bg-white px-[11px] text-[13px] font-medium leading-[39px] outline-none focus:border-[#6c27d6]";
  const fieldClass = "mt-[10px] block text-[12.5px] font-extrabold text-[#4b4453]";
  const editorBackClass = "rounded-full bg-[#f3eaff] px-[12px] py-[7px] text-[12px] font-black text-[#6c27d6]";
  const chipClass = (active: boolean) => `min-h-[27px] rounded-full border px-[12px] text-[12px] font-extrabold leading-[27px] ${active ? "border-[#8f4dff] bg-[#f3eaff] text-[#7c2ce6]" : "border-[#ddd7e8] bg-[#f5f6fa] text-[#6b6474]"}`;

  return (
    <div className="min-h-screen bg-[#f7f3ff] text-[#171321]">
      <GlobalPublicNav />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-[24px] px-[14px] pb-[calc(26px+env(safe-area-inset-bottom))] pt-24 sm:px-6">
        <section className="flex flex-col gap-[24px]">
          <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
            <div className="mb-[11px] flex items-center gap-[9px]">
              <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-[44px] w-[44px] shrink-0 object-contain" />
              <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">
                妈妈好赚
              </h1>
            </div>
            <p className="text-[13px] font-semibold leading-[1.68] text-[#5f5966]">
              如果你愿意用自己的社交媒体账号接亲子、教育、家庭消费相关发稿，可以先把基础资料提交给我们，运营会按备注联系你。
            </p>
            <div className="mt-[16px] grid gap-[12px] text-[11.5px] font-extrabold leading-[1.4] text-[#39206f]">
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">小红书、抖音账号优先，收主页链接</div>
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">不需要账号密码，不要求代登录</div>
              <div className="flex min-h-[52px] items-center rounded-[16px] border border-[#5e17eb]/10 bg-[#f1eaff] px-[14px]">数据用于任务匹配和运营联系，可随时回来更新</div>
            </div>
          </div>

          {!token || !user || requiresLogin ? (
            <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
              <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">登录后开始填写</h1>
              <p className="mb-[14px] mt-[5px] text-[12px] font-bold leading-[1.6] text-[#6b6474]">
                这个页面可以直接发给用户。先用手机号验证码登录，登录后资料会归属到当前账号，后续可继续查看任务和更新资料。
              </p>
              <InlineLoginForm compact onSuccess={handleLoginSuccess} />
            </div>
          ) : pageMode === "loading" ? (
            <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[24px] text-center text-[13px] font-bold text-[#6b6474]">资料加载中...</div>
          ) : pageMode === "error" ? (
            <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[18px] text-center">
              <h2 className="text-[17px] font-black text-[#151222]">加载失败</h2>
              <p className="mt-[6px] text-[12px] font-bold text-[#6b6474]">{loadError}</p>
              <button type="button" onClick={loadProfileAndTasks} className="mt-[14px] rounded-full bg-[#6c27d6] px-[18px] py-[9px] text-[13px] font-black text-white">重新加载</button>
            </div>
          ) : pageMode === "reviewing" && profile ? (
            <div className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[18px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
              <div className="text-[12px] font-extrabold text-[#6b6474]">账号状态</div>
              <h2 className="mt-[5px] text-[19px] font-black text-[#151222]">{profileStatusLabel(profile.status)}</h2>
              {profile.reviewNote?.note ? <p className="mt-[9px] rounded-[11px] bg-[#f8f6ff] p-[10px] text-[12px] font-bold leading-[1.6] text-[#6b6474]">{profile.reviewNote.note}</p> : null}
              <button type="button" onClick={() => setPageMode("apply")} className="mt-[14px] rounded-full border border-[#6c27d6] px-[15px] py-[8px] text-[12px] font-black text-[#6c27d6]">资料管理</button>
            </div>
          ) : pageMode === "tasks" && profile ? (
            <div className="grid gap-[12px]">
              <MamaResourceAccountCard profile={profile} onManage={() => setPageMode("apply")} />
              {visibleTasks.length ? visibleTasks.map((task) => (
                <MamaResourceTaskCard key={taskIdentity(task)} task={task} onOpen={() => openTask(task)} />
              )) : <div className="rounded-[17px] bg-white px-[14px] py-[24px] text-center text-[13px] font-bold text-[#6b6474]">暂时没有可接任务</div>}
            </div>
          ) : pageMode === "detail" && selectedTask ? (
            <MamaResourceTaskDetail
              task={selectedTask}
              claiming={taskClaiming}
              claimError={taskClaimError}
              onBack={() => setPageMode("tasks")}
              onClaim={claimSelectedTask}
            />
          ) : pageMode === "apply" ? (
            <form id="mama-resource-apply-form" onSubmit={handleSubmit} className="rounded-[17px] border border-[#5e17eb]/15 bg-white px-[14px] py-[15px] shadow-[0_8px_22px_rgba(94,23,235,0.08)]">
              <div className="mb-[11px] flex items-center justify-between gap-[9px]">
                <div>
                  <h1 className="text-[19px] font-black leading-[1.18] text-[#151222]">资料管理</h1>
                  <p className="mt-[3px] text-[11.5px] font-bold text-[#6b6474]">这里是资料总览，个人资料和社交媒体账号独立维护</p>
                </div>
              </div>

              {profileManagerMode === "overview" ? (
                <div className="grid gap-[10px]">
                  <button type="button" onClick={() => setProfileManagerMode("personal")} className="grid grid-cols-[1fr_auto] items-center rounded-[12px] border border-[#dbe8ff] bg-[#f7faff] p-[12px] text-left">
                    <span>
                      <span className="block text-[14px] font-black text-[#151222]">个人资料</span>
                      <span className="mt-[4px] block text-[12px] font-bold leading-[1.45] text-[#6b6474]">{profileOverview.personalSummary}</span>
                    </span>
                    <span className="text-[12px] font-black text-[#6c27d6]">编辑</span>
                  </button>
                  <button type="button" onClick={() => setProfileManagerMode("media")} className="grid grid-cols-[1fr_auto] items-center rounded-[12px] border border-[#e2d6ff] bg-[#fbf7ff] p-[12px] text-left">
                    <span>
                      <span className="block text-[14px] font-black text-[#151222]">社交媒体账号</span>
                      <span className="mt-[4px] block text-[12px] font-bold leading-[1.45] text-[#6b6474]">{profileOverview.mediaSummary}</span>
                    </span>
                    <span className="text-[12px] font-black text-[#6c27d6]">管理</span>
                  </button>
                  {(form.xiaohongshuNickname || form.xiaohongshuProfileUrl || form.followerCount) ? (
                    <div className="rounded-[11px] bg-[#f8f6ff] p-[10px]">
                      <div className="text-[12px] font-black text-[#151222]">{form.xiaohongshuNickname || "小红书账号"}</div>
                      <div className="mt-[4px] text-[11.5px] font-bold leading-[1.45] text-[#6b6474]">
                        小红书{form.followerCount ? ` · 粉丝 ${form.followerCount}` : ""}{form.realNameVerified ? ` · ${form.realNameVerified === "yes" ? "已实名" : "未实名"}` : ""}
                      </div>
                    </div>
                  ) : null}
                  {form.mediaAccounts.map((account, index) => (
                    <div key={index} className="rounded-[11px] bg-[#f8f6ff] p-[10px]">
                      <div className="text-[12px] font-black text-[#151222]">{account.nickname || `${platformOptions.find((item) => item.value === account.platform)?.label || "媒体"}账号 ${index + 2}`}</div>
                      <div className="mt-[4px] text-[11.5px] font-bold leading-[1.45] text-[#6b6474]">
                        {platformOptions.find((item) => item.value === account.platform)?.label || "未选平台"}{account.followerCount ? ` · 粉丝 ${account.followerCount}` : ""}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setProfileManagerMode("preference")} className="grid grid-cols-[1fr_auto] items-center rounded-[12px] border border-[#d7f0dd] bg-[#f7fcf8] p-[12px] text-left">
                    <span>
                      <span className="block text-[14px] font-black text-[#151222]">接单偏好</span>
                      <span className="mt-[4px] block text-[12px] font-bold leading-[1.45] text-[#6b6474]">{profileOverview.preferenceSummary}</span>
                      <span className="mt-[4px] block text-[12px] font-bold leading-[1.45] text-[#6b6474]">{profileOverview.consentSummary}</span>
                    </span>
                    <span className="text-[12px] font-black text-[#6c27d6]">编辑</span>
                  </button>
                  {message ? (
                    <div className={`rounded-[11px] px-[11px] py-[10px] text-[13px] font-extrabold ${submitted ? "bg-[#effaf4] text-[#166534]" : "bg-[#fff1f2] text-[#be123c]"}`}>
                      {message}
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-[3px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14.5px] font-black leading-none text-white shadow-[0_7px_16px_rgba(108,39,214,0.24)] disabled:cursor-not-allowed disabled:bg-[#c8c2d3] disabled:shadow-none"
                  >
                    {submitting ? "保存中..." : "保存资料"}
                  </button>
                </div>
              ) : null}

              {profileManagerMode === "personal" ? (
                <div className="grid gap-0 border-t border-[#f0ebf7] pt-[11px]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-black text-[#151222]">个人信息</h2>
                    <button type="button" className={editorBackClass} onClick={saveCurrentProfileSectionAndBack}>保存并返回</button>
                  </div>
                  <label className={fieldClass}>
                    姓名/昵称
                    <input className={inputClass} value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} placeholder="例如：安安妈妈" />
                  </label>
                  <label className={fieldClass}>
                    微信号
                    <input name="contactWechat" className={inputClass} value={form.contactWechat} onChange={(event) => updateField("contactWechat", event.target.value)} placeholder="优先通过微信添加" />
                  </label>
                  <label className={fieldClass}>
                    手机号
                    <input name="contactPhone" className={inputClass} value={form.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} placeholder="备用联系电话" />
                  </label>
                  <label className={fieldClass}>
                    城市
                    <input className={inputClass} value={form.city} onChange={(event) => updateField("city", event.target.value)} placeholder="上海 / 杭州" />
                  </label>
                  <label className={fieldClass}>
                    孩子阶段
                    <select name="childStage" className={`${inputClass} text-[#8b8792]`} value={form.childStage} onChange={(event) => updateField("childStage", event.target.value)}>
                      <option value="">请选择</option>
                      {childStageOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <div className={fieldClass}>
                    <div>孩子性别</div>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {childGenderOptions.map((item) => (
                        <button key={item} type="button" onClick={() => updateField("childGender", item)} className={chipClass(form.childGender === item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="mt-[13px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14.5px] font-black leading-none text-white" onClick={saveCurrentProfileSectionAndBack}>保存个人信息</button>
                </div>
              ) : null}

              {profileManagerMode === "media" ? (
                <div className="grid gap-0 border-t border-[#f0ebf7] pt-[11px]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-black text-[#151222]">社交媒体账号</h2>
                    <button type="button" className={editorBackClass} onClick={saveCurrentProfileSectionAndBack}>保存并返回</button>
                  </div>
                  <label className={fieldClass}>
                    小红书账号昵称
                    <input name="xiaohongshuNickname" className={inputClass} value={form.xiaohongshuNickname} onChange={(event) => updateField("xiaohongshuNickname", event.target.value)} placeholder="账号主页展示的昵称" />
                  </label>
                  <label className={fieldClass}>
                    小红书主页链接
                    <input className={inputClass} value={form.xiaohongshuProfileUrl} onChange={(event) => updateField("xiaohongshuProfileUrl", event.target.value)} placeholder="https://www.xiaohongshu.com/user/profile/..." />
                  </label>
                  <label className={fieldClass}>
                    小红书页面截图
                    <input type="file" accept="image/*" onChange={handleScreenshotChange} className="mt-[6px] min-h-[39px] w-full rounded-[11px] border border-[#ddd7e8] bg-white px-[11px] py-[9px] text-[12px] font-medium outline-none focus:border-[#6c27d6]" />
                    <span className="mt-[4px] block text-[11px] font-bold text-[#8b8792]">
                      {uploadingScreenshot ? "截图上传中..." : form.xiaohongshuScreenshotUrl ? "已上传，可继续提交" : "从手机相册选择小红书主页截图"}
                    </span>
                  </label>
                  <label className={fieldClass}>
                    粉丝数
                    <input name="followerCount" inputMode="numeric" className={inputClass} value={form.followerCount} onChange={(event) => updateField("followerCount", event.target.value)} placeholder="例如：12800" />
                  </label>
                  <div className={fieldClass}>
                    <div>是否实名认证</div>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {realNameVerifiedOptions.map((item) => (
                        <button key={item.value} type="button" onClick={() => updateField("realNameVerified", form.realNameVerified === item.value ? "" : item.value)} className={chipClass(form.realNameVerified === item.value)}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-[12px] rounded-[12px] bg-[#f8f6ff] p-[10px]">
                    <div className="flex items-center justify-between gap-[10px]">
                      <div>
                        <div className="text-[12.5px] font-extrabold text-[#4b4453]">其他媒体账号</div>
                        <p className="mt-[2px] text-[11px] font-bold text-[#8b8792]">可继续补充小红书或抖音账号。</p>
                      </div>
                      <button type="button" onClick={addMediaAccount} className="shrink-0 rounded-full border border-[#6c27d6] px-[12px] py-[7px] text-[12px] font-black text-[#6c27d6]">添加新账号</button>
                    </div>
                    {form.mediaAccounts.map((account, index) => (
                      <div key={index} className="mt-[10px] rounded-[11px] border border-[#e5def4] bg-white p-[10px]">
                        <div className="flex items-center justify-between gap-[10px]">
                          <div className="text-[12px] font-black text-[#4b4453]">账号 {index + 2}</div>
                          <button type="button" onClick={() => removeMediaAccount(index)} className="text-[12px] font-black text-[#be123c]">删除</button>
                        </div>
                        <div className="mt-[8px] flex flex-wrap gap-[6px]">
                          {platformOptions.map((item) => (
                            <button key={item.value} type="button" onClick={() => updateMediaAccount(index, "platform", item.value)} className={chipClass(account.platform === item.value)}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                          账号昵称
                          <input className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]" value={account.nickname} onChange={(event) => updateMediaAccount(index, "nickname", event.target.value)} placeholder="必填" />
                        </label>
                        <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                          主页链接
                          <input className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]" value={account.profileUrl} onChange={(event) => updateMediaAccount(index, "profileUrl", event.target.value)} placeholder="账号主页链接" />
                        </label>
                        <label className="mt-[8px] block text-[12px] font-extrabold text-[#4b4453]">
                          粉丝数
                          <input inputMode="numeric" className="mt-[5px] h-[37px] w-full rounded-[10px] border border-[#ddd7e8] px-[10px] text-[13px] font-medium outline-none focus:border-[#6c27d6]" value={account.followerCount} onChange={(event) => updateMediaAccount(index, "followerCount", event.target.value)} placeholder="例如：8000" />
                        </label>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="mt-[13px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14.5px] font-black leading-none text-white" onClick={saveCurrentProfileSectionAndBack}>保存社交媒体账号</button>
                </div>
              ) : null}

              {profileManagerMode === "preference" ? (
                <div className="grid gap-0 border-t border-[#f0ebf7] pt-[11px]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-black text-[#151222]">接单偏好</h2>
                    <button type="button" className={editorBackClass} onClick={saveCurrentProfileSectionAndBack}>保存并返回</button>
                  </div>
                  <label className={fieldClass}>
                    账号定位
                    <textarea className="mt-[6px] min-h-[40px] w-full rounded-[11px] border border-[#ddd7e8] px-[11px] py-[10px] text-[13px] font-medium leading-[1.5] outline-none focus:border-[#6c27d6]" value={form.accountPositioning} onChange={(event) => updateField("accountPositioning", event.target.value)} placeholder="例如：亲子阅读、学习规划、家居收纳、母婴好物" />
                  </label>
                  <div className="mt-[10px]">
                    <div className="text-[12.5px] font-extrabold text-[#4b4453]">可发品类</div>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {categoryOptions.map((item) => (
                        <button key={item} type="button" onClick={() => updateField("categories", toggleValue(form.categories, item))} className={`min-h-[31px] rounded-full border px-[13px] text-[13.5px] font-extrabold leading-[31px] ${form.categories.includes(item) ? "border-[#6c27d6] bg-[#6c27d6] text-white" : "border-[#ddd7e8] bg-white text-[#5d5666]"}`}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-[11px] grid gap-[8px] rounded-[12px] bg-[#f8f6ff] p-[10px]">
                    <label className="block text-[12.5px] font-extrabold text-[#4b4453]">
                      暂不接的品类
                      <input className={inputClass} value={form.blockedCategories} onChange={(event) => updateField("blockedCategories", event.target.value)} placeholder="例如：医美、金融、成人用品" />
                    </label>
                    <label className="flex items-start gap-[5px] text-[12px] font-extrabold leading-[1.5] text-[#4b4453]">
                      <input type="checkbox" checked={form.consentAccepted} onChange={(event) => updateField("consentAccepted", event.target.checked)} className="peer sr-only" />
                      <span className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-[#6c27d6] bg-white text-[11px] font-black leading-none text-[#6c27d6] opacity-40 peer-checked:opacity-100">✓</span>
                      我同意家和万事团队为发稿资源匹配和运营联系使用以上资料
                    </label>
                  </div>
                  <button type="button" className="mt-[13px] w-full rounded-[13px] bg-[#6c27d6] p-[13px] text-[14.5px] font-black leading-none text-white" onClick={saveCurrentProfileSectionAndBack}>保存接单偏好</button>
                </div>
              ) : null}
            </form>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default MamaResourceApplyPage;
