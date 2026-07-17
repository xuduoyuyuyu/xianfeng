import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  MamaResourceMediaAccount,
  MamaResourceProfile,
  MamaResourceProofStatus,
  MamaResourceStatus,
  MamaResourceTask,
  MamaResourceTaskAssignment,
  MamaResourceTaskAssignmentStatus,
  MamaResourceContentImportPreview,
} from "../../services/api";

const PAGE_SIZE = 20;
const childStageOptions = ["孕产/婴幼儿", "幼儿园", "小学", "初中", "高中", "多孩家庭"];
const contentCapabilityOptions = ["能拍", "能剪", "能写"];

const statusOptions: Array<{ value: MamaResourceStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "approved", label: "可派单" },
  { value: "needs_info", label: "资料不足" },
  { value: "rejected", label: "暂不合适" },
];

const statusLabel: Record<MamaResourceStatus, string> = {
  pending: "待审核",
  approved: "可派单",
  needs_info: "资料不足",
  rejected: "暂不合适",
};

const statusClass: Record<MamaResourceStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  needs_info: "bg-sky-50 text-sky-700 border-sky-200",
  rejected: "bg-stone-100 text-stone-600 border-stone-200",
};

const mediaPlatformLabel: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  shipinhao: "视频号",
  gongzhonghao: "公众号",
  other: "其他",
};

type ManualMediaAccount = Omit<MamaResourceMediaAccount, "followerCount"> & { followerCount: string };

const assignmentStatusLabel: Record<MamaResourceTaskAssignmentStatus, string> = {
  assigned: "进行中",
  submitted: "待审核",
  collected: "已收录",
  rejected: "已驳回",
};

const assignmentStatusClass: Record<MamaResourceTaskAssignmentStatus, string> = {
  assigned: "bg-sky-50 text-sky-700 border-sky-200",
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  collected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-stone-100 text-stone-600 border-stone-200",
};

const taskStatusLabel: Record<string, string> = {
  listed: "已上架",
  paused: "已暂停",
  archived: "已归档",
};

const rentuibangXiaohongshuTask = {
  title: "任推邦（红薯）评论",
  category: "小红书评论",
  difficulty: "简单",
  phase: "测试期",
  unitPriceCents: 100,
  dataCycle: "T+9",
  settlementCycle: "T+9",
  promotionCount: 42527,
  claimLimit: "",
  latestDataDate: "2026-06-29",
  announcement: "项目重要通知",
  settlementStandard: "按平台要求发布小红书原创评论内容，并保留 7 天。后台审核通过后进入收录结算。",
  requirement: "围绕亲子阅读、学习用品等适配品类完成小红书评论；提交笔记链接和完成截图，截图需能看到账号与内容状态。",
  externalUrl: "https://tg.bd.cn/#/pages/zt/pc/index?path=pages%2Findex%2Fcomponents%2Fdetail&appId=986&invite_code=5104192&qd=self_reg_android",
};

type PageMode = "tasks" | "review";
type TaskProofStatusFilter = "all" | MamaResourceProofStatus;

const proofStatusFilterOptions: Array<{ value: TaskProofStatusFilter; label: string }> = [
  { value: "all", label: "全部返图状态" },
  { value: "returned", label: "已返图" },
  { value: "missing", label: "未返图" },
];

type TaskDraft = {
  title: string;
  category: string;
  matchCategoriesText: string;
  matchRiskTagsText: string;
  minFollowerCount: string;
  difficulty: string;
  phase: string;
  unitPriceYuan: string;
  trafficFeeYuan: string;
  dataCycle: string;
  settlementCycle: string;
  promotionCount: string;
  claimLimit: string;
  latestDataDate: string;
  announcement: string;
  settlementStandard: string;
  requirement: string;
  externalUrl: string;
  exampleImageUrls: string[];
};

type TaskCreateMessage = { type: "error" | "success"; text: string };

function initialTaskDraft(): TaskDraft {
  return {
    title: rentuibangXiaohongshuTask.title,
    category: rentuibangXiaohongshuTask.category,
    matchCategoriesText: "亲子阅读、学习用品",
    matchRiskTagsText: "",
    minFollowerCount: "5000",
    difficulty: rentuibangXiaohongshuTask.difficulty,
    phase: rentuibangXiaohongshuTask.phase,
    unitPriceYuan: "1.00",
    trafficFeeYuan: "",
    dataCycle: rentuibangXiaohongshuTask.dataCycle,
    settlementCycle: rentuibangXiaohongshuTask.settlementCycle,
    promotionCount: String(rentuibangXiaohongshuTask.promotionCount),
    claimLimit: rentuibangXiaohongshuTask.claimLimit,
    latestDataDate: rentuibangXiaohongshuTask.latestDataDate,
    announcement: rentuibangXiaohongshuTask.announcement,
    settlementStandard: rentuibangXiaohongshuTask.settlementStandard,
    requirement: rentuibangXiaohongshuTask.requirement,
    externalUrl: rentuibangXiaohongshuTask.externalUrl,
    exampleImageUrls: [],
  };
}

function toDateText(value?: string | null): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toMoneyText(value?: number | null): string {
  if (value === undefined || value === null) return "待定";
  return `¥${(Number(value) / 100).toFixed(2)}`;
}

function resolveAdminAssetUrl(url: string): string {
  const text = String(url || "").trim();
  if (!text) return "";
  if (/^(https?:)?\/\//i.test(text) || text.startsWith("data:") || text.startsWith("blob:")) return text;
  const apiOrigin = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (!apiOrigin) return text;
  return `${apiOrigin}${text.startsWith("/") ? text : `/${text}`}`;
}

function taskDraftFromTask(task: MamaResourceTask): TaskDraft {
  return {
    title: task.title || "",
    category: task.category || "",
    matchCategoriesText: (task.matchCategories || []).join("、"),
    matchRiskTagsText: (task.matchRiskTags || []).join("、"),
    minFollowerCount: task.minFollowerCount === undefined || task.minFollowerCount === null ? "" : String(task.minFollowerCount),
    difficulty: task.difficulty || "",
    phase: task.phase || "",
    unitPriceYuan: (Number(task.unitPriceCents || 0) / 100).toFixed(2),
    trafficFeeYuan: task.trafficFeeCents === undefined || task.trafficFeeCents === null ? "" : (Number(task.trafficFeeCents || 0) / 100).toFixed(2),
    dataCycle: task.dataCycle || "",
    settlementCycle: task.settlementCycle || "",
    promotionCount: task.promotionCount === undefined || task.promotionCount === null ? "" : String(task.promotionCount),
    claimLimit: task.claimLimit === undefined || task.claimLimit === null ? "" : String(task.claimLimit),
    latestDataDate: task.latestDataDate ? task.latestDataDate.slice(0, 10) : "",
    announcement: task.announcement || "",
    settlementStandard: task.settlementStandard || "",
    requirement: task.requirement || "",
    externalUrl: task.externalUrl || "",
    exampleImageUrls: task.exampleImageUrls || [],
  };
}

function toCount(value?: number | null): string {
  if (value === undefined || value === null) return "待补";
  return Number(value).toLocaleString("zh-CN");
}

function extractProfileUrl(value?: string): string {
  return String(value || "").match(/https?:\/\/[^\s<>"'，。；、]+/i)?.[0].replace(/[)\]}，。！？；：,!?;:]+$/, "") || "";
}

function maskAlipayAccount(value: string | undefined): string {
  const account = String(value || "").trim();
  if (!account) return "未填支付宝";
  if (account.length <= 4) return `${account.slice(0, 1)}***`;
  return `${account.slice(0, 3)}****${account.slice(-3)}`;
}

function realNameLabel(value?: boolean | null): string {
  if (value === true) return "已实名认证";
  if (value === false) return "未实名认证";
  return "未填实名认证";
}

function splitTags(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requestErrorMessage(error: any, fallback: string): string {
  const data = error?.response?.data;
  const message = data?.message || data?.error || error?.message || fallback;
  return String(message).trim() || fallback;
}

function assignmentBadge(status?: string) {
  if (!status || !(status in assignmentStatusLabel)) return null;
  const key = status as MamaResourceTaskAssignmentStatus;
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-black ${assignmentStatusClass[key]}`}>
      {assignmentStatusLabel[key]}
    </span>
  );
}

function proofStatusBadge(status?: MamaResourceProofStatus) {
  if (status === "returned") {
    return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">已返图</span>;
  }
  return <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-xs font-black text-stone-600">未返图</span>;
}

const AdminMamaResourcesPageContent: React.FC<{ mode: PageMode }> = ({ mode }) => {
  const [items, setItems] = useState<MamaResourceProfile[]>([]);
  const [tasks, setTasks] = useState<MamaResourceTask[]>([]);
  const [assignments, setAssignments] = useState<MamaResourceTaskAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [contentUrlDrafts, setContentUrlDrafts] = useState<Record<string, string>>({});
  const [contentLinkText, setContentLinkText] = useState("");
  const [contentImportPreview, setContentImportPreview] = useState<MamaResourceContentImportPreview | null>(null);
  const [contentImportOpen, setContentImportOpen] = useState(false);
  const [contentLinkImportOpen, setContentLinkImportOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MamaResourceTask | null>(null);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskEditingId, setTaskEditingId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => initialTaskDraft());
  const [taskCreateMessage, setTaskCreateMessage] = useState<TaskCreateMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskImageUploading, setTaskImageUploading] = useState(false);
  const [transferScreenshotUploadingId, setTransferScreenshotUploadingId] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<MamaResourceStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [childStageFilter, setChildStageFilter] = useState("");
  const [childGenderFilter, setChildGenderFilter] = useState("");
  const [contentCapabilityFilter, setContentCapabilityFilter] = useState<string[]>([]);
  const [contentCapabilityFilterOpen, setContentCapabilityFilterOpen] = useState(false);
  const [userGenderFilter, setUserGenderFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<MamaResourceMediaAccount["platform"] | "">("");
  const [searchText, setSearchText] = useState("");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState("");
  const [taskRiskTagFilter, setTaskRiskTagFilter] = useState("");
  const [taskMinFollowers, setTaskMinFollowers] = useState("");
  const [taskSearchText, setTaskSearchText] = useState("");
  const [taskOperatorTagFilter, setTaskOperatorTagFilter] = useState("");
  const [taskOrderBlockedFilter, setTaskOrderBlockedFilter] = useState<"all" | "allowed" | "blocked">("all");
  const [taskProofStatusFilter, setTaskProofStatusFilter] = useState<TaskProofStatusFilter>("all");
  const [operatorTagsDraft, setOperatorTagsDraft] = useState("");
  const [editing, setEditing] = useState<MamaResourceProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<MamaResourceStatus>("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [suitableCategoriesText, setSuitableCategoriesText] = useState("");
  const [riskTagsText, setRiskTagsText] = useState("");
  const [manualMediaAccounts, setManualMediaAccounts] = useState<ManualMediaAccount[]>([]);
  const [manualAlipayAccount, setManualAlipayAccount] = useState("");
  const [manualAlipayVerifiedName, setManualAlipayVerifiedName] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isReviewMode = mode === "review";

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    items.forEach((item) => item.categories?.forEach((category) => categories.add(category)));
    assignments.forEach((assignment) => assignment.profile?.categories?.forEach((category) => categories.add(category)));
    return Array.from(categories);
  }, [items, assignments]);

  const loadItems = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.getMamaResources({
        status: statusFilter,
        category: categoryFilter || undefined,
        minFollowers: minFollowers || undefined,
        childStage: childStageFilter || undefined,
        childGender: childGenderFilter || undefined,
        contentCapabilities: contentCapabilityFilter.length ? contentCapabilityFilter : undefined,
        userGender: userGenderFilter || undefined,
        platform: platformFilter || undefined,
        search: searchText || undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
      setPage(response.data.page || nextPage);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "加载好赚失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    const response = await adminApi.getMamaResourceTasks();
    const nextTasks = response.data.tasks || [];
    setTasks(nextTasks);
    return nextTasks;
  };

  const loadTaskWorkspace = async (taskId: string, proofStatus: TaskProofStatusFilter = taskProofStatusFilter) => {
    setTaskLoading(true);
    try {
      const assignmentResponse = await adminApi.getMamaResourceTaskAssignments(taskId, {
        proofStatus,
        category: taskCategoryFilter || undefined,
        minFollowers: taskMinFollowers || undefined,
        search: taskSearchText || undefined,
        riskTag: taskRiskTagFilter || undefined,
        operatorTag: taskOperatorTagFilter || undefined,
        orderBlocked: taskOrderBlockedFilter === "all" ? undefined : taskOrderBlockedFilter === "blocked",
      });
      const nextAssignments = assignmentResponse.data.assignments || [];
      setAssignments(nextAssignments);
      setSelectedAssignmentId((current) => nextAssignments.some((assignment) => assignment._id === current) ? current : "");
      setContentUrlDrafts(Object.fromEntries(nextAssignments.map((assignment) => [assignment._id, assignment.contentUrl || ""])));
    } catch (loadError: any) {
      setToast(loadError?.response?.data?.message || loadError?.message || "任务账号加载失败");
    } finally {
      setTaskLoading(false);
    }
  };

  useEffect(() => {
    if (isReviewMode) loadItems(1);
  }, [statusFilter, categoryFilter, minFollowers, childStageFilter, childGenderFilter, userGenderFilter, platformFilter, contentCapabilityFilter, isReviewMode]);

  useEffect(() => {
    if (!isReviewMode) loadTasks().catch(() => undefined);
  }, [isReviewMode]);

  const openEdit = (profile: MamaResourceProfile) => {
    setEditing(profile);
    setReviewStatus(profile.status);
    setReviewNote(profile.reviewNote?.note || "");
    setSuitableCategoriesText((profile.reviewNote?.suitableCategories || []).join("、"));
    setRiskTagsText((profile.reviewNote?.riskTags || []).join("、"));
    const mediaAccounts = profile.mediaAccounts?.length ? profile.mediaAccounts : [profile.socialAccount];
    setManualMediaAccounts(mediaAccounts.map((account) => ({
      ...account,
      followerCount: account.followerCount === undefined || account.followerCount === null ? "" : String(account.followerCount),
    })));
    setManualAlipayAccount(profile.alipayAccount || "");
    setManualAlipayVerifiedName(profile.alipayVerifiedName || "");
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const updateManualMediaAccount = (index: number, key: "nickname" | "followerCount", value: string) => {
    setManualMediaAccounts((current) => current.map((account, accountIndex) => (
      accountIndex === index ? { ...account, [key]: value } : account
    )));
  };

  const openTaskManager = async (task?: MamaResourceTask) => {
    setTaskManagerOpen(true);
    setSelectedAssignmentId("");
    setContentLinkText("");
    setTaskProofStatusFilter("all");
    setTaskLoading(true);
    try {
      const nextTasks = await loadTasks();
      const nextSelected = task || selectedTask || nextTasks[0] || null;
      setSelectedTask(nextSelected);
      if (nextSelected) await loadTaskWorkspace(nextSelected._id, "all");
    } catch (loadError: any) {
      setToast(loadError?.response?.data?.message || loadError?.message || "任务加载失败");
    } finally {
      setTaskLoading(false);
    }
  };

  const closeTaskManager = () => {
    if (taskLoading) return;
    setTaskManagerOpen(false);
    setContentLinkImportOpen(false);
    setContentImportOpen(false);
    setSelectedAssignmentId("");
  };

  const saveManualData = async () => {
    if (!editing || saving) return;
    if (!manualAlipayAccount.trim()) {
      setToast("请填写支付宝账号");
      return;
    }
    if (!manualAlipayVerifiedName.trim()) {
      setToast("请填写支付宝验证姓名");
      return;
    }
    setSaving(true);
    setToast("");
    try {
      const mediaAccounts = manualMediaAccounts.map((account) => ({
        ...account,
        nickname: account.nickname?.trim() || "",
        followerCount: account.followerCount ? Number(account.followerCount) : null,
        dataSource: "manual" as const,
      }));
      const primaryXiaohongshuAccount = mediaAccounts.find((account) => account.platform === "xiaohongshu");
      const updateResponse = await adminApi.updateMamaResource(editing._id, {
        alipayAccount: manualAlipayAccount.trim(),
        alipayVerifiedName: manualAlipayVerifiedName.trim(),
        mediaAccounts,
        socialAccount: primaryXiaohongshuAccount ? {
          ...editing.socialAccount,
          ...primaryXiaohongshuAccount,
          platform: "xiaohongshu",
        } : editing.socialAccount,
      });
      const reviewResponse = await adminApi.reviewMamaResource(editing._id, {
        status: reviewStatus,
        note: reviewNote,
        suitableCategories: splitTags(suitableCategoriesText),
        riskTags: splitTags(riskTagsText),
      });
      const latest = { ...updateResponse.data.profile, ...reviewResponse.data.profile };
      setEditing(latest);
      setToast("资源资料已更新");
      await loadItems(page);
    } catch (saveError: any) {
      setToast(saveError?.response?.data?.message || saveError?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openTaskCreate = () => {
    setTaskEditingId(null);
    setTaskDraft(initialTaskDraft());
    setTaskCreateMessage(null);
    setTaskCreateOpen(true);
  };

  const openTaskEdit = (task: MamaResourceTask) => {
    setTaskEditingId(task._id);
    setTaskDraft(taskDraftFromTask(task));
    setTaskCreateMessage(null);
    setTaskCreateOpen(true);
  };

  const closeTaskCreate = () => {
    if (taskLoading || taskImageUploading) return;
    setTaskCreateOpen(false);
    setTaskEditingId(null);
  };

  const handleTaskExampleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || taskImageUploading) return;
    setTaskImageUploading(true);
    setTaskCreateMessage(null);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const response = await adminApi.uploadAdminImage(file);
        if (response.data.url) uploadedUrls.push(response.data.url);
      }
      if (uploadedUrls.length === 0) throw new Error("配图上传失败");
      setTaskDraft((current) => ({
        ...current,
        exampleImageUrls: [...current.exampleImageUrls, ...uploadedUrls].slice(0, 12),
      }));
      setTaskCreateMessage({ type: "success", text: `已添加 ${uploadedUrls.length} 张配图` });
    } catch (uploadError: any) {
      const message = requestErrorMessage(uploadError, "配图上传失败");
      setTaskCreateMessage({ type: "error", text: message });
      setToast(message);
    } finally {
      setTaskImageUploading(false);
    }
  };

  const removeTaskExampleImage = (index: number) => {
    setTaskDraft((current) => ({
      ...current,
      exampleImageUrls: current.exampleImageUrls.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitTaskCreate = async () => {
    if (taskLoading || taskImageUploading) return;
    const title = taskDraft.title.trim();
    if (!title) {
      setTaskCreateMessage({ type: "error", text: "请填写任务标题" });
      return;
    }
    const unitPrice = Number(taskDraft.unitPriceYuan || 0);
    const trafficFee = taskDraft.trafficFeeYuan.trim() ? Number(taskDraft.trafficFeeYuan) : null;
    const minFollowerCount = taskDraft.minFollowerCount.trim() ? Number(taskDraft.minFollowerCount) : null;
    const promotionCount = taskDraft.promotionCount.trim() ? Number(taskDraft.promotionCount) : null;
    const claimLimit = taskDraft.claimLimit.trim() ? Number(taskDraft.claimLimit) : null;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的单价" });
      return;
    }
    if (trafficFee !== null && (!Number.isFinite(trafficFee) || trafficFee < 0)) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的投流费用" });
      return;
    }
    if (minFollowerCount !== null && (!Number.isFinite(minFollowerCount) || minFollowerCount < 0)) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的最低粉丝数" });
      return;
    }
    if (promotionCount !== null && (!Number.isFinite(promotionCount) || promotionCount < 0)) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的最新数据" });
      return;
    }
    if (claimLimit !== null && (!Number.isFinite(claimLimit) || claimLimit < 0 || !Number.isInteger(claimLimit))) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的领取人数限制" });
      return;
    }
    setTaskLoading(true);
    setToast("");
    setTaskCreateMessage(null);
    try {
      const payload = {
        title,
        category: taskDraft.category.trim(),
        matchCategories: splitTags(taskDraft.matchCategoriesText),
        matchRiskTags: splitTags(taskDraft.matchRiskTagsText),
        minFollowerCount: Number.isFinite(minFollowerCount) ? minFollowerCount : null,
        difficulty: taskDraft.difficulty.trim(),
        phase: taskDraft.phase.trim(),
        unitPriceCents: Number.isFinite(unitPrice) ? Math.round(unitPrice * 100) : 0,
        trafficFeeCents: trafficFee === null ? null : Math.round(trafficFee * 100),
        dataCycle: taskDraft.dataCycle.trim(),
        settlementCycle: taskDraft.settlementCycle.trim(),
        promotionCount: Number.isFinite(promotionCount) ? promotionCount : null,
        claimLimit: Number.isFinite(claimLimit) ? claimLimit : null,
        latestDataDate: taskDraft.latestDataDate.trim() || null,
        announcement: taskDraft.announcement.trim(),
        settlementStandard: taskDraft.settlementStandard.trim(),
        requirement: taskDraft.requirement.trim(),
        externalUrl: taskDraft.externalUrl.trim(),
        exampleImageUrls: taskDraft.exampleImageUrls,
      };
      if (taskEditingId) {
        const response = await adminApi.updateMamaResourceTask(taskEditingId, payload);
        setTasks((current) => current.map((task) => (task._id === response.data.task._id ? response.data.task : task)));
        setSelectedTask((current) => (current?._id === response.data.task._id ? response.data.task : current));
        setTaskCreateOpen(false);
        setTaskEditingId(null);
        setToast("任务已更新");
        return;
      }
      const response = await adminApi.createMamaResourceTask(payload);
      setTasks((current) => [response.data.task, ...current]);
      setSelectedTask(response.data.task);
      setTaskCreateOpen(false);
      setTaskManagerOpen(true);
      setToast("任务已上架，用户领取后会进入内容下发名单");
      await loadTaskWorkspace(response.data.task._id);
    } catch (createError: any) {
      const message = requestErrorMessage(createError, taskEditingId ? "任务更新失败" : "任务上架失败");
      setTaskCreateMessage({ type: "error", text: message });
      setToast(message);
    } finally {
      setTaskLoading(false);
    }
  };

  const reviewAssignment = async (assignment: MamaResourceTaskAssignment, status: MamaResourceTaskAssignmentStatus, note: string) => {
    if (taskLoading) return;
    setTaskLoading(true);
    setToast("");
    try {
      const response = await adminApi.reviewMamaResourceTaskAssignment(assignment._id, { status, reviewNote: note });
      setAssignments((current) => current.map((item) => item._id === assignment._id ? response.data.assignment : item));
      setToast(status === "collected" ? "任务已标记收录" : "任务已驳回");
    } catch (reviewError: any) {
      setToast(reviewError?.response?.data?.message || reviewError?.message || "任务审核失败");
    } finally {
      setTaskLoading(false);
    }
  };

  const filterTaskAssignmentsByProofStatus = async (proofStatus: TaskProofStatusFilter) => {
    setTaskProofStatusFilter(proofStatus);
    if (!selectedTask || taskLoading) return;
    setTaskLoading(true);
    try {
      const response = await adminApi.getMamaResourceTaskAssignments(selectedTask._id, {
        proofStatus,
        category: taskCategoryFilter || undefined,
        minFollowers: taskMinFollowers || undefined,
        search: taskSearchText || undefined,
        riskTag: taskRiskTagFilter || undefined,
        operatorTag: taskOperatorTagFilter || undefined,
        orderBlocked: taskOrderBlockedFilter === "all" ? undefined : taskOrderBlockedFilter === "blocked",
      });
      const nextAssignments = response.data.assignments || [];
      setAssignments(nextAssignments);
      setSelectedAssignmentId((current) => nextAssignments.some((assignment) => assignment._id === current) ? current : "");
      setContentUrlDrafts(Object.fromEntries(nextAssignments.map((assignment) => [assignment._id, assignment.contentUrl || ""])));
    } catch (filterError: any) {
      setToast(requestErrorMessage(filterError, "返图状态筛选失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  const configuredContentCount = assignments.filter((assignment) => Boolean(assignment.contentUrl)).length;
  const selectedAssignment = assignments.find((assignment) => assignment._id === selectedAssignmentId) || null;

  const selectAssignment = (assignment: MamaResourceTaskAssignment) => {
    setSelectedAssignmentId(assignment._id);
    setOperatorTagsDraft((assignment.profile?.operatorTags || []).join("、"));
  };

  const saveProfileOperations = async (assignment: MamaResourceTaskAssignment, orderBlocked = assignment.profile?.orderBlocked === true) => {
    if (!assignment.profile || taskLoading) return;
    const wasBlocked = assignment.profile.orderBlocked === true;
    setTaskLoading(true);
    try {
      const response = await adminApi.updateMamaResourceOperations(assignment.profile._id, {
        operatorTags: splitTags(operatorTagsDraft),
        orderBlocked,
      });
      setAssignments((current) => current.map((item) => item.profileId === response.data.profile._id
        ? { ...item, profile: response.data.profile }
        : item));
      setOperatorTagsDraft((response.data.profile.operatorTags || []).join("、"));
      setToast(orderBlocked ? "账号已禁止接单" : wasBlocked ? "账号已恢复接单" : "账号运营设置已保存");
    } catch (operationError: any) {
      setToast(requestErrorMessage(operationError, "运营设置保存失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  const saveAssignmentContentUrl = async (assignment: MamaResourceTaskAssignment) => {
    if (taskLoading) return;
    setTaskLoading(true);
    try {
      const contentUrl = contentUrlDrafts[assignment._id] || "";
      const response = await adminApi.updateMamaResourceAssignmentContent(assignment._id, contentUrl);
      setAssignments((current) => current.map((item) => item._id === assignment._id ? response.data.assignment : item));
      setContentUrlDrafts((current) => ({ ...current, [assignment._id]: response.data.assignment.contentUrl || "" }));
      setToast(contentUrl.trim() ? "专属内容链接已保存" : "专属内容链接已撤回");
    } catch (saveError: any) {
      setToast(requestErrorMessage(saveError, "专属内容链接保存失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  const handleTransferScreenshotUpload = async (assignmentId: string, file?: File) => {
    if (!file || transferScreenshotUploadingId) return;
    setTransferScreenshotUploadingId(assignmentId);
    setToast("");
    try {
      const uploadResponse = await adminApi.uploadAdminImage(file);
      const transferScreenshotUrl = uploadResponse.data.url;
      if (!transferScreenshotUrl) throw new Error("转账截图上传失败");
      const response = await adminApi.updateMamaResourceAssignmentTransferScreenshot(assignmentId, transferScreenshotUrl);
      setAssignments((current) => current.map((item) => item._id === assignmentId ? response.data.assignment : item));
      setToast("转账截图已保存");
    } catch (uploadError: any) {
      setToast(requestErrorMessage(uploadError, "转账截图上传失败"));
    } finally {
      setTransferScreenshotUploadingId("");
    }
  };

  const downloadContentImportTemplate = async () => {
    try {
      const response = await adminApi.downloadMamaResourceContentImportTemplate();
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "好赚专属链接导入模板.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError: any) {
      setToast(requestErrorMessage(downloadError, "模板下载失败"));
    }
  };

  const previewContentImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!selectedTask || !file || taskLoading) return;
    setTaskLoading(true);
    try {
      const response = await adminApi.previewMamaResourceContentImport(selectedTask._id, file);
      setContentImportPreview(response.data);
      setContentImportOpen(true);
    } catch (previewError: any) {
      setToast(requestErrorMessage(previewError, "Excel 预检失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  const commitContentImport = async () => {
    if (!selectedTask || !contentImportPreview || contentImportPreview.summary.invalid > 0 || taskLoading) return;
    setTaskLoading(true);
    try {
      const response = await adminApi.commitMamaResourceContentImport(selectedTask._id, contentImportPreview.rows);
      const { created, updated, unchanged } = response.data.summary;
      setToast(`导入完成：新增 ${created}，更新 ${updated}，未变化 ${unchanged}`);
      setContentImportOpen(false);
      setContentLinkImportOpen(false);
      setContentImportPreview(null);
      await loadTaskWorkspace(selectedTask._id);
    } catch (commitError: any) {
      setToast(requestErrorMessage(commitError, "确认导入失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  const importContentLinks = async () => {
    if (!selectedTask || !contentLinkText.trim() || taskLoading) return;
    setTaskLoading(true);
    setToast("");
    try {
      const response = await adminApi.importMamaResourceContentLinks(selectedTask._id, { linksText: contentLinkText });
      const { importedCount, skippedCount, assignedCount, task } = response.data;
      setContentLinkText("");
      setSelectedTask(task);
      setTasks((current) => current.map((item) => item._id === task._id ? task : item));
      const skippedText = skippedCount > 0 ? `，跳过 ${skippedCount} 条重复链接` : "";
      const assignedText = assignedCount > 0 ? `，已顺序分配 ${assignedCount} 个账号` : "";
      setToast(`已导入 ${importedCount} 条链接${assignedText}${skippedText}`);
      await loadTaskWorkspace(selectedTask._id);
      setContentLinkImportOpen(false);
    } catch (importError: any) {
      setToast(requestErrorMessage(importError, "批量链接导入失败"));
    } finally {
      setTaskLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-9 w-9 object-contain" />
            <h1 className="text-2xl font-black text-stone-900">{isReviewMode ? "账号资料" : "好赚"}</h1>
          </div>
          <p className="mt-1 text-sm font-medium text-stone-500">
            {isReviewMode ? "查看好赚账号资料，并按用户与平台条件筛选。" : "创建任务、设置匹配权重，并在任务里完成账号派发。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isReviewMode ? (
            <Link to="/admin/mama-resources" className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-4 py-2 text-sm font-bold text-[#5e17eb]">
              返回任务页
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openTaskManager()}
                className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-4 py-2 text-sm font-bold text-[#5e17eb]"
              >
                任务上架/选号
              </button>
              <Link to="/admin/mama-resources/review" className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700">
                账号资料
              </Link>
              <a
                href="/mama-resources/apply"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#6c27d6] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)]"
              >
                打开招募表单
              </a>
            </>
          )}
        </div>
      </div>

      {!isReviewMode ? <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-stone-900">任务列表</div>
            <div className="mt-1 text-xs font-semibold text-stone-500">创建任务时设置标签、要求和权重，系统会直接完成账号匹配。</div>
          </div>
          <button type="button" onClick={openTaskCreate} disabled={taskLoading} className="rounded-xl bg-[#6c27d6] px-3 py-2 text-xs font-black text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)] disabled:bg-stone-300 disabled:shadow-none">
            上架新任务
          </button>
        </div>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="rounded-xl bg-stone-50 px-4 py-5 text-center text-sm font-semibold text-stone-500">暂无已上架任务</div>
          ) : (
            tasks.slice(0, 4).map((task) => (
              <div key={task._id} className="grid w-full grid-cols-[minmax(0,1fr)_120px_120px_auto_auto] items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left hover:border-[#6c27d6] hover:bg-[#fbf8ff]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-stone-900">{task.title}</span>
                  <span className="mt-1 block text-xs font-semibold text-stone-500">
                    {task.category || "未分类"} · {task.phase || "阶段待定"} · {task.claimLimit ? `限 ${task.claimLimit} 人领取` : "不限领取"}
                  </span>
                </span>
                <span className="text-sm font-black text-red-500">{toMoneyText(task.unitPriceCents)}</span>
                <span className="text-xs font-bold text-stone-500">{task.pausedForContent ? "等待内容分配" : taskStatusLabel[String(task.status)] || task.status}</span>
                <button type="button" onClick={() => openTaskManager(task)} className="rounded-lg bg-[#f6f0ff] px-3 py-1.5 text-xs font-black text-[#5e17eb]">内容下发</button>
                <button type="button" onClick={() => openTaskEdit(task)} disabled={taskLoading} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-black text-stone-600 disabled:opacity-50">编辑</button>
              </div>
            ))
          )}
        </div>
      </section> : null}

      {isReviewMode ? <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadItems(1); }} className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="搜索昵称、手机号、微信号、账号链接" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MamaResourceStatus | "all")} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} list="mama-resource-categories" className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="品类筛选" />
          <datalist id="mama-resource-categories">{categoryOptions.map((item) => <option key={item} value={item} />)}</datalist>
          <input value={minFollowers} onChange={(event) => setMinFollowers(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="最低粉丝数" />
          <select value={childStageFilter} onChange={(event) => setChildStageFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            <option value="">全部孩子年龄</option>
            {childStageOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={childGenderFilter} onChange={(event) => setChildGenderFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            <option value="">全部孩子性别</option><option value="男孩">男孩</option><option value="女孩">女孩</option>
          </select>
          <select value={userGenderFilter} onChange={(event) => setUserGenderFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            <option value="">全部用户性别</option><option value="男">男</option><option value="女">女</option>
          </select>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as MamaResourceMediaAccount["platform"] | "")} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            <option value="">全部平台</option><option value="xiaohongshu">小红书</option><option value="douyin">抖音</option>
          </select>
          <div className="relative">
            <button type="button" onClick={() => setContentCapabilityFilterOpen((open) => !open)} className="flex h-full min-h-10 w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-[#6c27d6]">
              <span>{contentCapabilityFilter.length ? contentCapabilityFilter.join("、") : "创作能力"}</span>
              <span className="text-stone-400">⌄</span>
            </button>
            {contentCapabilityFilterOpen ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-48 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
                <div className="flex flex-wrap gap-2">
                  {contentCapabilityOptions.map((item) => {
                    const selected = contentCapabilityFilter.includes(item);
                    return <button key={item} type="button" onClick={() => setContentCapabilityFilter((current) => selected ? current.filter((value) => value !== item) : current.concat(item))} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-[#6c27d6] bg-[#6c27d6] text-white" : "border-stone-200 bg-white text-stone-600"}`}>{item}</button>;
                  })}
                </div>
                <div className="mt-3 flex justify-end gap-2 border-t border-stone-100 pt-3">
                  <button type="button" onClick={() => setContentCapabilityFilter([])} className="px-2 py-1 text-xs font-bold text-stone-500">清空</button>
                  <button type="button" onClick={() => setContentCapabilityFilterOpen(false)} className="rounded-lg bg-[#f6f0ff] px-3 py-1.5 text-xs font-black text-[#5e17eb]">确定</button>
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => loadItems(1)} className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-4 py-2 text-sm font-bold text-[#5e17eb]">筛选</button>
        </div>
      </section> : null}

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {toast ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{toast}</div> : null}

      {isReviewMode ? <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_0.9fr_1.25fr_0.65fr_auto] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3 text-xs font-black text-stone-500">
          <span>账号卡片</span>
          <span>品类</span>
          <span>平台账号</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {loading ? (
          <div className="px-4 py-10 text-center text-sm font-semibold text-stone-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm font-semibold text-stone-500">暂无资源</div>
        ) : (
          items.map((profile) => (
            <div key={profile._id} className="grid grid-cols-[1.2fr_0.9fr_1.25fr_0.65fr_auto] gap-3 border-b border-stone-100 px-4 py-4 text-sm last:border-b-0">
              <div className="min-w-0">
                <div className="font-black text-stone-900">{profile.displayName}</div>
                {extractProfileUrl(profile.socialAccount.profileUrl) ? <a className="mt-1 block truncate text-xs font-semibold text-[#6c27d6]" href={extractProfileUrl(profile.socialAccount.profileUrl)} target="_blank" rel="noreferrer">{profile.socialAccount.nickname || profile.socialAccount.profileUrl}</a> : <div className="mt-1 truncate text-xs font-semibold text-stone-500">{profile.socialAccount.nickname || "未识别主页链接"}</div>}
                <div className="mt-1 text-xs text-stone-500">{profile.city || "未填城市"} · {profile.childStage || "未填阶段"} · {profile.childGender || "未填性别"}</div>
                {profile.contentCapabilities?.length ? <div className="mt-1 text-xs font-semibold text-stone-500">创作能力 {profile.contentCapabilities.join("、")}</div> : null}
                <div className="mt-1 text-xs font-semibold text-stone-500">{maskAlipayAccount(profile.alipayAccount)}</div>
                <div className="mt-1 text-xs font-semibold text-stone-500">
                  <span className={profile.socialAccount.realNameVerified === true ? "inline-flex rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : ""}>{realNameLabel(profile.socialAccount.realNameVerified)}</span>
                  {profile.socialAccount.screenshotUrl ? <a className="ml-2 text-[#6c27d6]" href={profile.socialAccount.screenshotUrl} target="_blank" rel="noreferrer">主页截图</a> : <span className="ml-2">未传截图</span>}
                </div>
              </div>
              <div className="flex flex-wrap content-start items-start gap-1">
                {(profile.categories || []).slice(0, 3).map((category) => <span key={category} className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-[#f6f0ff] px-2 py-1 text-xs font-bold leading-none text-[#5e17eb]">{category}</span>)}
              </div>
              <div className="space-y-1 text-xs text-stone-700">
                {(profile.mediaAccounts?.length ? profile.mediaAccounts : [profile.socialAccount]).map((account, index) => (
                  <div key={`${account.platform}-${account.profileUrl}-${index}`} className="flex h-5 min-w-0 items-center gap-1.5">
                    <span className="shrink-0 text-stone-400">{mediaPlatformLabel[account.platform] || "其他"}</span>
                    {extractProfileUrl(account.profileUrl) ? <a className="min-w-0 truncate font-semibold text-[#6c27d6]" href={extractProfileUrl(account.profileUrl)} target="_blank" rel="noreferrer">{account.nickname || "未填昵称"}</a> : <span className="min-w-0 truncate font-semibold">{account.nickname || "未填昵称"}</span>}
                    <span className="shrink-0 font-black text-stone-900">{account.followerCount === undefined || account.followerCount === null ? "待补" : `${toCount(account.followerCount)} 粉丝`}</span>
                  </div>
                ))}
              </div>
              <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClass[profile.status]}`}>{statusLabel[profile.status]}</span></div>
              <button type="button" onClick={() => openEdit(profile)} className="inline-flex h-9 items-center justify-center rounded-full border border-[#e6d7ff] bg-[#f7f2ff] px-5 text-xs font-black text-[#5e17eb] shadow-sm transition hover:border-[#6c27d6] hover:bg-[#efe5ff]">
                查看
              </button>
            </div>
          ))
        )}
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-sm text-stone-500">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => loadItems(page - 1)} className="rounded-lg border border-stone-200 px-3 py-1 disabled:opacity-40">上一页</button>
            <span>{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => loadItems(page + 1)} className="rounded-lg border border-stone-200 px-3 py-1 disabled:opacity-40">下一页</button>
          </div>
        </div>
      </section> : null}

      {isReviewMode && editing ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeEdit}>
          <aside role="dialog" aria-modal="true" aria-label="编辑资源详情" className="mx-auto my-8 max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
              <div>
                <div className="text-xs font-black text-stone-400">编辑资源详情</div>
                <h2 className="mt-1 text-xl font-black text-stone-900">{editing.displayName}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-stone-600">
                  <span className={`rounded-full px-2.5 py-1 ${editing.socialAccount.realNameVerified === true ? "bg-emerald-50 text-emerald-700" : "bg-stone-100"}`}>{realNameLabel(editing.socialAccount.realNameVerified)}</span>
                  <span className={`rounded-full border px-2.5 py-1 ${statusClass[editing.status]}`}>{statusLabel[editing.status]}</span>
                  {editing.socialAccount.screenshotUrl ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={editing.socialAccount.screenshotUrl} target="_blank" rel="noreferrer">查看主页截图</a> : <span className="rounded-full bg-stone-100 px-2.5 py-1">未上传主页截图</span>}
                </div>
              </div>
              <button type="button" onClick={closeEdit} disabled={saving} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="text-sm font-black text-stone-900">账号资料</div>
                <p className="mt-2 text-sm leading-6 text-stone-600">{editing.accountPositioning || "未填写账号定位"}</p>
                <div className="mt-4 space-y-3">
                  {manualMediaAccounts.map((account, index) => (
                    <div key={`${account.normalizedProfileUrl || account.profileUrl}-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-stone-900">账号 {index + 1} · {mediaPlatformLabel[account.platform] || account.platform}</span>
                        {extractProfileUrl(account.profileUrl) ? <a href={extractProfileUrl(account.profileUrl)} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#6c27d6]">查看主页</a> : <span className="text-xs font-semibold text-stone-400">未识别主页链接</span>}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-bold text-stone-700">账号昵称<input value={account.nickname || ""} onChange={(event) => updateManualMediaAccount(index, "nickname", event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" /></label>
                        <label className="text-sm font-bold text-stone-700">粉丝数<input value={account.followerCount} onChange={(event) => updateManualMediaAccount(index, "followerCount", event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="人工补录" /></label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-700">支付宝账号<input value={manualAlipayAccount} onChange={(event) => setManualAlipayAccount(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="用于任务结算转账" /></label>
                  <label className="text-sm font-bold text-stone-700">支付宝验证姓名<input value={manualAlipayVerifiedName} onChange={(event) => setManualAlipayVerifiedName(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="支付宝实名认证姓名" /></label>
                </div>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm font-bold text-stone-700">资料状态<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as MamaResourceStatus)} className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">{statusOptions.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="text-sm font-bold text-stone-700">运营备注<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-1 min-h-[96px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-bold text-stone-700">适合品类<input value={suitableCategoriesText} onChange={(event) => setSuitableCategoriesText(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-bold text-stone-700">风险标签<input value={riskTagsText} onChange={(event) => setRiskTagsText(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="需补近期账号数据、内容不稳定" /></label>
                  <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500">最近更新：{toDateText(editing.updatedAt)} · 数据来源：{editing.socialAccount.dataSource || "pending"}</div>
                </div>
                <button onClick={saveManualData} disabled={saving} className="mt-4 w-full rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">{saving ? "保存中..." : "保存资料"}</button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {!isReviewMode && taskCreateOpen ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeTaskCreate}>
          <aside role="dialog" aria-modal="true" aria-label={taskEditingId ? "编辑任务" : "创建新任务"} className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
              <div>
                <div className="text-xs font-black text-stone-400">{taskEditingId ? "编辑任务" : "创建新任务"}</div>
                <h2 className="mt-1 text-xl font-black text-stone-900">{taskEditingId ? "修改任务信息" : "上架新任务"}</h2>
                <div className="mt-1 text-sm font-semibold text-stone-500">{taskEditingId ? "更新项目说明、价格、要求和配图，保存后小程序端同步展示。" : "设置分类标签、要求和匹配权重，提交后直接匹配已审核账号。"}</div>
              </div>
              <button type="button" onClick={closeTaskCreate} disabled={taskLoading || taskImageUploading} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold text-stone-700">任务标题<input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">任务类型<input value={taskDraft.category} onChange={(event) => setTaskDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="小红书评论" /></label>
                <label className="text-sm font-bold text-stone-700">单价（元）<input value={taskDraft.unitPriceYuan} onChange={(event) => setTaskDraft((current) => ({ ...current, unitPriceYuan: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">投流费用（元）<input value={taskDraft.trafficFeeYuan} onChange={(event) => setTaskDraft((current) => ({ ...current, trafficFeeYuan: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="不填则前端不展示" /></label>
                <label className="text-sm font-bold text-stone-700">阶段<input value={taskDraft.phase} onChange={(event) => setTaskDraft((current) => ({ ...current, phase: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">数据周期<input value={taskDraft.dataCycle} onChange={(event) => setTaskDraft((current) => ({ ...current, dataCycle: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">结算周期<input value={taskDraft.settlementCycle} onChange={(event) => setTaskDraft((current) => ({ ...current, settlementCycle: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">匹配分类标签<input value={taskDraft.matchCategoriesText} onChange={(event) => setTaskDraft((current) => ({ ...current, matchCategoriesText: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="亲子阅读、学习用品" /></label>
                <label className="text-sm font-bold text-stone-700">匹配风险标签<input value={taskDraft.matchRiskTagsText} onChange={(event) => setTaskDraft((current) => ({ ...current, matchRiskTagsText: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="内容稳定、需近期开播" /></label>
                <label className="text-sm font-bold text-stone-700">最低粉丝数<input value={taskDraft.minFollowerCount} onChange={(event) => setTaskDraft((current) => ({ ...current, minFollowerCount: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="5000" /></label>
                <label className="text-sm font-bold text-stone-700">领取人数限制<input value={taskDraft.claimLimit} onChange={(event) => setTaskDraft((current) => ({ ...current, claimLimit: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="不填则不限，填写后先到先得" /></label>
                <label className="text-sm font-bold text-stone-700">最新数据<input value={taskDraft.latestDataDate} onChange={(event) => setTaskDraft((current) => ({ ...current, latestDataDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="2026-06-29" /></label>
              </div>
              <label className="block text-sm font-bold text-stone-700">项目链接<input value={taskDraft.externalUrl} onChange={(event) => setTaskDraft((current) => ({ ...current, externalUrl: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-bold text-stone-700">项目公告<textarea value={taskDraft.announcement} onChange={(event) => setTaskDraft((current) => ({ ...current, announcement: event.target.value }))} className="mt-1 min-h-[88px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="不填则小程序端不展示公告入口" /></label>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-stone-700">配图示意图</div>
                    <div className="mt-1 text-xs font-semibold text-stone-500">支持一次添加多张，用于展示任务内容示例。</div>
                  </div>
                  <label className="cursor-pointer rounded-xl bg-[#6c27d6] px-4 py-2 text-xs font-black text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)]">
                    {taskImageUploading ? "上传中..." : "添加配图"}
                    <input type="file" accept="image/*" multiple disabled={taskImageUploading} onChange={handleTaskExampleImageUpload} className="hidden" />
                  </label>
                </div>
                {taskDraft.exampleImageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {taskDraft.exampleImageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-xl border border-stone-200 bg-white">
                        <a href={resolveAdminAssetUrl(url)} target="_blank" rel="noreferrer" title="打开原图">
                          <img src={resolveAdminAssetUrl(url)} alt="" className="aspect-[4/3] w-full object-cover" />
                        </a>
                        <button type="button" onClick={() => removeTaskExampleImage(index)} disabled={taskImageUploading} className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-black text-red-500 shadow-sm disabled:opacity-50">删除</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold text-stone-700">发布要求<textarea value={taskDraft.requirement} onChange={(event) => setTaskDraft((current) => ({ ...current, requirement: event.target.value }))} className="mt-1 min-h-[110px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">结算标准<textarea value={taskDraft.settlementStandard} onChange={(event) => setTaskDraft((current) => ({ ...current, settlementStandard: event.target.value }))} className="mt-1 min-h-[110px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
              </div>
              {taskCreateMessage ? (
                <div className={`rounded-xl px-3 py-2 text-sm font-bold ${taskCreateMessage.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {taskCreateMessage.text}
                </div>
              ) : null}
              <button type="button" onClick={submitTaskCreate} disabled={taskLoading || taskImageUploading} className="w-full rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)] disabled:bg-stone-300 disabled:shadow-none">
                {taskLoading ? (taskEditingId ? "保存中..." : "上架中...") : (taskEditingId ? "保存修改" : "提交上架")}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {!isReviewMode && taskManagerOpen ? (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeTaskManager}>
          <aside role="dialog" aria-modal="true" aria-label="当前任务内容下发" className="mx-auto my-6 max-w-[min(96vw,1440px)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
              <div>
                <div className="text-xs font-black text-stone-400">内容下发</div>
                <h2 className="mt-1 text-xl font-black text-stone-900">{selectedTask?.title || "当前任务"}</h2>
                <div className="mt-1 text-sm font-semibold text-stone-500">只展示已经领取当前任务的账号，并管理专属内容与运营状态。</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setContentLinkImportOpen(true)} disabled={!selectedTask || taskLoading} className="rounded-full bg-[#6c27d6] px-4 py-2 text-sm font-black text-white hover:bg-[#5e17eb] disabled:bg-stone-300">导入链接</button>
                <button type="button" onClick={closeTaskManager} disabled={taskLoading} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
              </div>
            </div>
            <div className="space-y-4 p-5">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-stone-900">用户筛选</div>
                      <div className="mt-1 text-xs font-semibold text-stone-500">从已领取当前任务的账号中筛选，并快速查看返图与接单状态。</div>
                    </div>
                    <button type="button" onClick={() => selectedTask && loadTaskWorkspace(selectedTask._id)} disabled={!selectedTask || taskLoading} className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-3 py-2 text-xs font-black text-[#5e17eb] disabled:opacity-50">筛选账号</button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <input value={taskSearchText} onChange={(event) => setTaskSearchText(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="昵称/手机/微信/ID" />
                    <input value={taskCategoryFilter} onChange={(event) => setTaskCategoryFilter(event.target.value)} list="mama-resource-categories" className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="品类标签" />
                    <input value={taskRiskTagFilter} onChange={(event) => setTaskRiskTagFilter(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="风险标签" />
                    <input value={taskMinFollowers} onChange={(event) => setTaskMinFollowers(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="最低粉丝数" />
                    <input value={taskOperatorTagFilter} onChange={(event) => setTaskOperatorTagFilter(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="运营标签" />
                    <select value={taskOrderBlockedFilter} onChange={(event) => setTaskOrderBlockedFilter(event.target.value as "all" | "allowed" | "blocked")} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
                      <option value="all">全部接单状态</option>
                      <option value="allowed">可接单</option>
                      <option value="blocked">已禁接</option>
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="返图状态快捷筛选">
                    <span className="mr-1 text-xs font-black text-stone-500">返图状态</span>
                    {proofStatusFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void filterTaskAssignmentsByProofStatus(option.value)}
                        disabled={taskLoading}
                        className={`rounded-full border px-3 py-1.5 text-xs font-black transition disabled:opacity-50 ${taskProofStatusFilter === option.value ? "border-[#6c27d6] bg-[#6c27d6] text-white" : "border-[#d8ccff] bg-[#f7f2ff] text-[#5e17eb] hover:border-[#6c27d6]"}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-stone-900">领取任务账号</div>
                        <div className="mt-1 text-xs font-semibold text-stone-500">已领取 {assignments.length} 人 · 已配置内容 {configuredContentCount}/{assignments.length}</div>
                      </div>
                    </div>
                    <div className="grid min-h-[360px] gap-4 xl:grid-cols-[minmax(220px,3fr)_minmax(0,7fr)]">
                      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1" aria-label="领取任务账号列表">
                        {assignments.length === 0 ? (
                          <div className="rounded-xl bg-white px-3 py-6 text-center text-sm font-semibold text-stone-500">暂无用户领取当前任务</div>
                        ) : assignments.map((assignment) => (
                          <button
                            key={assignment._id}
                            type="button"
                            onClick={() => selectAssignment(assignment)}
                            className={`w-full rounded-xl border p-3 text-left transition ${selectedAssignmentId === assignment._id ? "border-[#6c27d6] bg-[#f7f2ff] shadow-[0_8px_20px_rgba(108,39,214,0.08)]" : "border-stone-200 bg-white hover:border-[#b98df1]"}`}
                          >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-stone-900">{assignment.profile?.displayName || "未命名账号"}</div>
                              <div className="mt-1 truncate text-xs font-semibold text-stone-500">ID {assignment.user?._id || "未匹配"}</div>
                              <div className="mt-1 text-xs font-semibold text-stone-500">手机 {assignment.user?.mobile || assignment.profile?.contactPhone || "未填"} · 领取 {toDateText(assignment.createdAt)}</div>
                              {(assignment.profile?.operatorTags || []).length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">{assignment.profile?.operatorTags?.map((tag) => <span key={tag} className="rounded-full bg-[#f2ecff] px-2 py-0.5 text-[11px] font-black text-[#5e17eb]">{tag}</span>)}</div>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {proofStatusBadge(assignment.proofStatus)}
                              {assignment.profile?.orderBlocked ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">已禁接</span> : null}
                              {assignmentBadge(assignment.status)}
                            </div>
                          </div>
                          </button>
                        ))}
                      </div>
                      <div className="max-h-[520px] overflow-y-auto rounded-xl border border-stone-200 bg-white p-4" aria-label="领取任务账号详情">
                        {!selectedAssignment ? (
                          <div className="flex min-h-[320px] items-center justify-center text-center">
                            <div>
                              <div className="text-sm font-black text-stone-700">请选择账号</div>
                              <div className="mt-2 text-xs font-semibold text-stone-400">点击左侧领取账号后，在这里查看身份信息、打标签并配置专属链接。</div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                              <div className="min-w-0">
                                <div className="truncate text-base font-black text-stone-900">{selectedAssignment.profile?.displayName || "未命名账号"}</div>
                                <div className="mt-1 text-xs font-semibold text-stone-500">ID {selectedAssignment.user?._id || "未匹配站内用户"} · 手机 {selectedAssignment.user?.mobile || selectedAssignment.profile?.contactPhone || "未填"}</div>
                                <div className="mt-1 text-xs font-semibold text-stone-500">站内昵称 {selectedAssignment.user?.name || selectedAssignment.user?.username || "未填"} · 平台昵称 {selectedAssignment.profile?.socialAccount?.nickname || "未填"}</div>
                                <div className="mt-1 text-xs font-semibold text-stone-500">微信 {selectedAssignment.profile?.contactWechat || "未填"} · 品类 {(selectedAssignment.profile?.categories || []).join("、") || "未填"}</div>
                                <div className="mt-1 text-xs font-semibold text-stone-500">{[selectedAssignment.user?.city, selectedAssignment.user?.region, selectedAssignment.user?.childGrade || selectedAssignment.user?.grade || selectedAssignment.profile?.childStage].filter(Boolean).join(" · ") || "城市、区域、孩子年级未填"} · 粉丝 {toCount(selectedAssignment.profile?.socialAccount?.followerCount)}</div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {proofStatusBadge(selectedAssignment.proofStatus)}
                                {selectedAssignment.profile?.orderBlocked ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">已禁接</span> : null}
                                {assignmentBadge(selectedAssignment.status)}
                              </div>
                            </div>
                          <div className="mt-3 rounded-xl border border-[#e6ddff] bg-[#fbf9ff] p-3">
                            <div className="text-xs font-black text-stone-700">运营标签与接单权限</div>
                            <input value={operatorTagsDraft} onChange={(event) => setOperatorTagsDraft(event.target.value)} placeholder="如：配合度高、母婴、需跟进" className="mt-2 w-full rounded-lg border border-[#d8ccff] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#6c27d6]" />
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" onClick={() => saveProfileOperations(selectedAssignment)} disabled={taskLoading} className="rounded-lg border border-[#6c27d6] bg-white px-3 py-2 text-xs font-black text-[#5e17eb] disabled:opacity-50">保存标签</button>
                              <button type="button" onClick={() => saveProfileOperations(selectedAssignment, !selectedAssignment.profile?.orderBlocked)} disabled={taskLoading} className={`rounded-lg px-3 py-2 text-xs font-black text-white disabled:bg-stone-300 ${selectedAssignment.profile?.orderBlocked ? "bg-emerald-600" : "bg-rose-600"}`}>
                                {selectedAssignment.profile?.orderBlocked ? "恢复账号接单" : "禁止账号接单"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="mb-1 text-xs font-black text-stone-600">专属内容链接</div>
                            <div className="flex gap-2">
                              <input
                                value={contentUrlDrafts[selectedAssignment._id] ?? selectedAssignment.contentUrl ?? ""}
                                onChange={(event) => setContentUrlDrafts((current) => ({ ...current, [selectedAssignment._id]: event.target.value }))}
                                placeholder="https://my.feishu.cn/wiki/..."
                                className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-2 text-xs outline-none focus:border-[#6c27d6]"
                              />
                              <button type="button" onClick={() => saveAssignmentContentUrl(selectedAssignment)} disabled={taskLoading} className="rounded-lg border border-[#6c27d6] bg-[#f7f2ff] px-3 py-2 text-xs font-black text-[#5e17eb] disabled:opacity-50">保存</button>
                            </div>
                          </div>
                          {selectedAssignment.proofLink || selectedAssignment.proofScreenshotUrl ? (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                              {selectedAssignment.proofLink ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={selectedAssignment.proofLink} target="_blank" rel="noreferrer">完成链接</a> : null}
                              {selectedAssignment.proofScreenshotUrl ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={selectedAssignment.proofScreenshotUrl} target="_blank" rel="noreferrer">完成截图</a> : null}
                            </div>
                          ) : <div className="mt-2 text-xs font-semibold text-stone-400">用户尚未提交证明</div>}
                          <div className="mt-3 rounded-xl bg-stone-50 p-3">
                            <div className="text-xs font-black text-stone-600">转账截图</div>
                            {selectedAssignment.transferScreenshotUrl ? (
                              <a href={selectedAssignment.transferScreenshotUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                                <img src={selectedAssignment.transferScreenshotUrl} alt="任务转账凭证" className="max-h-40 w-full rounded-lg object-contain" />
                              </a>
                            ) : null}
                            {selectedAssignment.transferScreenshotUpdatedAt ? <div className="mt-2 text-xs font-semibold text-stone-400">更新于 {toDateText(selectedAssignment.transferScreenshotUpdatedAt)}</div> : null}
                            <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-[#6c27d6] bg-white px-3 py-2 text-xs font-black text-[#5e17eb]">
                              {transferScreenshotUploadingId === selectedAssignment._id ? "上传中..." : selectedAssignment.transferScreenshotUrl ? "替换截图" : "上传转账截图"}
                              <input type="file" accept="image/*" disabled={Boolean(transferScreenshotUploadingId)} onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void handleTransferScreenshotUpload(selectedAssignment._id, file);
                              }} className="hidden" />
                            </label>
                          </div>
                          {selectedAssignment.status === "submitted" ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => reviewAssignment(selectedAssignment, "collected", "已核对链接和截图，标记收录")} disabled={taskLoading} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-stone-300">标记已收录</button>
                              <button type="button" onClick={() => reviewAssignment(selectedAssignment, "rejected", "证明材料不完整，请重新提交")} disabled={taskLoading} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-black text-stone-700 disabled:opacity-50">驳回</button>
                            </div>
                          ) : null}
                          </div>
                        )}
                        </div>
                    </div>
                  </div>
            </div>
          </aside>
        </div>
      ) : null}
      {!isReviewMode && taskManagerOpen && contentLinkImportOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={() => !taskLoading && setContentLinkImportOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="导入专属链接" className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-stone-900">导入链接</div>
                <div className="mt-1 text-sm font-semibold text-stone-500">选择按领取顺序分配，或通过 Excel 按账号匹配导入。</div>
              </div>
              <button type="button" onClick={() => setContentLinkImportOpen(false)} disabled={taskLoading} className="text-xl font-black text-stone-400 disabled:opacity-50">×</button>
            </div>
            <div className="mt-5 rounded-2xl border border-[#e6ddff] bg-[#fbf9ff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-stone-900">按领取顺序导入</div>
                    {selectedTask?.pausedForContent ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">等待内容分配</span> : null}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-stone-500">已导入 {selectedTask?.contentLinkCount || 0} 条 · 已分配 {selectedTask?.contentLinkAssignedCount || 0} 条 · 剩余 {selectedTask?.contentLinkRemainingCount || 0} 条</div>
                </div>
                <button type="button" onClick={importContentLinks} disabled={!selectedTask || !contentLinkText.trim() || taskLoading} className="rounded-xl bg-[#6c27d6] px-3 py-2 text-xs font-black text-white disabled:bg-stone-300">{taskLoading ? "处理中..." : "导入并顺序分配"}</button>
              </div>
              <textarea value={contentLinkText} onChange={(event) => setContentLinkText(event.target.value)} placeholder="每行一个专属内容链接，也支持逗号分隔；重复链接会自动跳过" className="mt-3 min-h-[110px] w-full rounded-xl border border-[#d8ccff] bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" />
              <div className="mt-2 text-xs font-semibold text-stone-500">链接按账号分配时间顺序绑定；链接耗尽后任务自动暂停，补充链接后恢复。</div>
            </div>
            <div className="mt-4 rounded-2xl border border-stone-200 p-4">
              <div className="text-sm font-black text-stone-900">按账号批量导入</div>
              <div className="mt-1 text-xs font-semibold text-stone-500">下载模板填写账号与专属链接，上传后先预检再确认导入。</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={downloadContentImportTemplate} disabled={taskLoading} className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-stone-300 bg-white px-3 text-xs font-black text-stone-700 disabled:opacity-50">下载导入模板</button>
                <label className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-[#6c27d6] px-3 text-xs font-black text-white ${taskLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                  选择 Excel 文件
                  <input type="file" accept=".xlsx,.xls" disabled={taskLoading} onChange={previewContentImport} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {contentImportOpen && contentImportPreview ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-stone-900">专属链接导入预检</div>
                <div className="mt-1 text-sm font-semibold text-stone-500">共 {contentImportPreview.summary.total} 行，可导入 {contentImportPreview.summary.valid} 行，错误 {contentImportPreview.summary.invalid} 行</div>
              </div>
              <button type="button" onClick={() => setContentImportOpen(false)} className="text-xl font-black text-stone-400">×</button>
            </div>
            <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {contentImportPreview.rows.map((row) => (
                <div key={`${row.rowNumber}-${row.profileId}`} className={`rounded-xl border p-3 text-xs ${row.valid ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <div className="font-black text-stone-900">第 {row.rowNumber} 行 · {row.displayName || row.profileId || "未填写账号ID"}</div>
                  <div className="mt-1 break-all font-semibold text-stone-600">{row.contentUrl || "未填写链接"}</div>
                  {row.errors.length > 0 ? <div className="mt-1 font-bold text-rose-700">{row.errors.join("；")}</div> : null}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setContentImportOpen(false)} className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-black text-stone-700">取消</button>
              <button type="button" onClick={commitContentImport} disabled={taskLoading || contentImportPreview.summary.invalid > 0} className="rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">确认导入</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const AdminMamaResourcesPage: React.FC = () => <AdminMamaResourcesPageContent mode="tasks" />;

export const AdminMamaResourceReviewPage: React.FC = () => <AdminMamaResourcesPageContent mode="review" />;

export default AdminMamaResourcesPage;
