import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  MamaResourceProfile,
  MamaResourceStatus,
  MamaResourceTask,
  MamaResourceTaskAssignment,
  MamaResourceTaskAssignmentStatus,
  MamaResourceTaskCandidate,
} from "../../services/api";

const PAGE_SIZE = 20;

const statusOptions: Array<{ value: MamaResourceStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
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
  latestDataDate: "2026-06-29",
  announcement: "项目重要通知",
  settlementStandard: "按平台要求发布小红书原创评论内容，并保留 7 天。后台审核通过后进入收录结算。",
  requirement: "围绕亲子阅读、学习用品等适配品类完成小红书评论；提交笔记链接和完成截图，截图需能看到账号与内容状态。",
  externalUrl: "https://tg.bd.cn/#/pages/zt/pc/index?path=pages%2Findex%2Fcomponents%2Fdetail&appId=986&invite_code=5104192&qd=self_reg_android",
};

type PageMode = "tasks" | "review";

type TaskDraft = {
  title: string;
  category: string;
  matchCategoriesText: string;
  matchRiskTagsText: string;
  minFollowerCount: string;
  difficulty: string;
  phase: string;
  unitPriceYuan: string;
  dataCycle: string;
  settlementCycle: string;
  promotionCount: string;
  latestDataDate: string;
  announcement: string;
  settlementStandard: string;
  requirement: string;
  externalUrl: string;
  exampleImageUrls: string[];
  autoAssign: boolean;
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
    dataCycle: rentuibangXiaohongshuTask.dataCycle,
    settlementCycle: rentuibangXiaohongshuTask.settlementCycle,
    promotionCount: String(rentuibangXiaohongshuTask.promotionCount),
    latestDataDate: rentuibangXiaohongshuTask.latestDataDate,
    announcement: rentuibangXiaohongshuTask.announcement,
    settlementStandard: rentuibangXiaohongshuTask.settlementStandard,
    requirement: rentuibangXiaohongshuTask.requirement,
    externalUrl: rentuibangXiaohongshuTask.externalUrl,
    exampleImageUrls: [],
    autoAssign: true,
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

function toCount(value?: number | null): string {
  if (value === undefined || value === null) return "待补";
  return Number(value).toLocaleString("zh-CN");
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

const AdminMamaResourcesPageContent: React.FC<{ mode: PageMode }> = ({ mode }) => {
  const [items, setItems] = useState<MamaResourceProfile[]>([]);
  const [tasks, setTasks] = useState<MamaResourceTask[]>([]);
  const [candidates, setCandidates] = useState<MamaResourceTaskCandidate[]>([]);
  const [assignments, setAssignments] = useState<MamaResourceTaskAssignment[]>([]);
  const [selectedTask, setSelectedTask] = useState<MamaResourceTask | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => initialTaskDraft());
  const [taskCreateMessage, setTaskCreateMessage] = useState<TaskCreateMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskImageUploading, setTaskImageUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<MamaResourceStatus | "all">("pending");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [searchText, setSearchText] = useState("");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState("");
  const [taskRiskTagFilter, setTaskRiskTagFilter] = useState("");
  const [taskMinFollowers, setTaskMinFollowers] = useState("");
  const [taskSearchText, setTaskSearchText] = useState("");
  const [editing, setEditing] = useState<MamaResourceProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<MamaResourceStatus>("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [suitableCategoriesText, setSuitableCategoriesText] = useState("");
  const [riskTagsText, setRiskTagsText] = useState("");
  const [manualFollowerCount, setManualFollowerCount] = useState("");
  const [manualNickname, setManualNickname] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isReviewMode = mode === "review";

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    items.forEach((item) => item.categories?.forEach((category) => categories.add(category)));
    candidates.forEach((item) => item.categories?.forEach((category) => categories.add(category)));
    return Array.from(categories);
  }, [items, candidates]);

  const loadItems = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.getMamaResources({
        status: statusFilter,
        category: categoryFilter || undefined,
        minFollowers: minFollowers || undefined,
        search: searchText || undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
      setPage(response.data.page || nextPage);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "加载妈妈好赚失败");
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

  const loadTaskWorkspace = async (taskId: string) => {
    setTaskLoading(true);
    try {
      const [candidateResponse, assignmentResponse] = await Promise.all([
        adminApi.getMamaResourceTaskCandidates(taskId, {
          status: "approved",
          category: taskCategoryFilter || undefined,
          minFollowers: taskMinFollowers || undefined,
          search: taskSearchText || undefined,
          riskTag: taskRiskTagFilter || undefined,
        }),
        adminApi.getMamaResourceTaskAssignments(taskId),
      ]);
      setCandidates(candidateResponse.data.items || []);
      setAssignments(assignmentResponse.data.assignments || []);
      setSelectedCandidateIds([]);
    } catch (loadError: any) {
      setToast(loadError?.response?.data?.message || loadError?.message || "任务账号加载失败");
    } finally {
      setTaskLoading(false);
    }
  };

  useEffect(() => {
    if (isReviewMode) loadItems(1);
  }, [statusFilter, categoryFilter, minFollowers, isReviewMode]);

  useEffect(() => {
    if (!isReviewMode) loadTasks().catch(() => undefined);
  }, [isReviewMode]);

  const openEdit = (profile: MamaResourceProfile) => {
    setEditing(profile);
    setReviewStatus(profile.status);
    setReviewNote(profile.reviewNote?.note || "");
    setSuitableCategoriesText((profile.reviewNote?.suitableCategories || []).join("、"));
    setRiskTagsText((profile.reviewNote?.riskTags || []).join("、"));
    setManualFollowerCount(profile.socialAccount?.followerCount ? String(profile.socialAccount.followerCount) : "");
    setManualNickname(profile.socialAccount?.nickname || "");
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const openTaskManager = async (task?: MamaResourceTask) => {
    setTaskManagerOpen(true);
    setTaskLoading(true);
    try {
      const nextTasks = await loadTasks();
      const nextSelected = task || selectedTask || nextTasks[0] || null;
      setSelectedTask(nextSelected);
      if (nextSelected) await loadTaskWorkspace(nextSelected._id);
    } catch (loadError: any) {
      setToast(loadError?.response?.data?.message || loadError?.message || "任务加载失败");
    } finally {
      setTaskLoading(false);
    }
  };

  const closeTaskManager = () => {
    if (taskLoading) return;
    setTaskManagerOpen(false);
  };

  const selectTask = async (task: MamaResourceTask) => {
    setSelectedTask(task);
    await loadTaskWorkspace(task._id);
  };

  const saveManualData = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setToast("");
    try {
      const updateResponse = await adminApi.updateMamaResource(editing._id, {
        socialAccount: {
          ...editing.socialAccount,
          nickname: manualNickname.trim(),
          followerCount: manualFollowerCount ? Number(manualFollowerCount) : null,
          dataSource: "manual",
        },
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
    setTaskDraft(initialTaskDraft());
    setTaskCreateMessage(null);
    setTaskCreateOpen(true);
  };

  const closeTaskCreate = () => {
    if (taskLoading || taskImageUploading) return;
    setTaskCreateOpen(false);
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
    const minFollowerCount = taskDraft.minFollowerCount.trim() ? Number(taskDraft.minFollowerCount) : null;
    const promotionCount = taskDraft.promotionCount.trim() ? Number(taskDraft.promotionCount) : null;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setTaskCreateMessage({ type: "error", text: "请输入有效的单价" });
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
    setTaskLoading(true);
    setToast("");
    setTaskCreateMessage(null);
    try {
      const response = await adminApi.createMamaResourceTask({
        title,
        category: taskDraft.category.trim(),
        matchCategories: splitTags(taskDraft.matchCategoriesText),
        matchRiskTags: splitTags(taskDraft.matchRiskTagsText),
        minFollowerCount: Number.isFinite(minFollowerCount) ? minFollowerCount : null,
        difficulty: taskDraft.difficulty.trim(),
        phase: taskDraft.phase.trim(),
        unitPriceCents: Number.isFinite(unitPrice) ? Math.round(unitPrice * 100) : 0,
        dataCycle: taskDraft.dataCycle.trim(),
        settlementCycle: taskDraft.settlementCycle.trim(),
        promotionCount: Number.isFinite(promotionCount) ? promotionCount : null,
        latestDataDate: taskDraft.latestDataDate.trim() || null,
        announcement: taskDraft.announcement.trim(),
        settlementStandard: taskDraft.settlementStandard.trim(),
        requirement: taskDraft.requirement.trim(),
        externalUrl: taskDraft.externalUrl.trim(),
        exampleImageUrls: taskDraft.exampleImageUrls,
        autoAssign: taskDraft.autoAssign,
      });
      setTasks((current) => [response.data.task, ...current]);
      setSelectedTask(response.data.task);
      setTaskCreateOpen(false);
      setTaskManagerOpen(true);
      const assignedCount = response.data.assignments?.length || 0;
      setToast(assignedCount > 0 ? `任务已上架，已自动匹配 ${assignedCount} 个账号` : "任务已上架，可继续精准选号");
      await loadTaskWorkspace(response.data.task._id);
    } catch (createError: any) {
      const message = requestErrorMessage(createError, "任务上架失败");
      setTaskCreateMessage({ type: "error", text: message });
      setToast(message);
    } finally {
      setTaskLoading(false);
    }
  };

  const assignSelectedTaskCandidates = async () => {
    if (!selectedTask || selectedCandidateIds.length === 0 || taskLoading) return;
    setTaskLoading(true);
    setToast("");
    try {
      await adminApi.assignMamaResourceTaskProfiles(selectedTask._id, selectedCandidateIds);
      setToast(`已分配 ${selectedCandidateIds.length} 个账号`);
      await loadTaskWorkspace(selectedTask._id);
    } catch (assignError: any) {
      setToast(assignError?.response?.data?.message || assignError?.message || "账号分配失败");
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

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) => (
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-9 w-9 object-contain" />
            <h1 className="text-2xl font-black text-stone-900">{isReviewMode ? "账号资料审核" : "妈妈好赚"}</h1>
          </div>
          <p className="mt-1 text-sm font-medium text-stone-500">
            {isReviewMode ? "独立审核妈妈账号资料，审核通过后进入任务匹配池。" : "创建任务、设置匹配权重，并在任务里完成账号派发。"}
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
                账号审核
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
              <button
                key={task._id}
                type="button"
                onClick={() => openTaskManager(task)}
                className="grid w-full grid-cols-[minmax(0,1fr)_120px_120px_auto] items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left hover:border-[#6c27d6] hover:bg-[#fbf8ff]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-stone-900">{task.title}</span>
                  <span className="mt-1 block text-xs font-semibold text-stone-500">{task.category || "未分类"} · {task.phase || "阶段待定"}</span>
                </span>
                <span className="text-sm font-black text-red-500">{toMoneyText(task.unitPriceCents)}</span>
                <span className="text-xs font-bold text-stone-500">{taskStatusLabel[String(task.status)] || task.status}</span>
                <span className="rounded-lg bg-[#f6f0ff] px-3 py-1.5 text-xs font-black text-[#5e17eb]">账号选号</span>
              </button>
            ))
          )}
        </div>
      </section> : null}

      {isReviewMode ? <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.8fr_auto]">
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadItems(1); }} className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="搜索昵称、手机号、微信号、账号链接" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MamaResourceStatus | "all")} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#6c27d6]">
            {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} list="mama-resource-categories" className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="品类筛选" />
          <datalist id="mama-resource-categories">{categoryOptions.map((item) => <option key={item} value={item} />)}</datalist>
          <input value={minFollowers} onChange={(event) => setMinFollowers(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#6c27d6]" placeholder="最低粉丝数" />
          <button type="button" onClick={() => loadItems(1)} className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-4 py-2 text-sm font-bold text-[#5e17eb]">筛选</button>
        </div>
      </section> : null}

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {toast ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{toast}</div> : null}

      {isReviewMode ? <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.8fr_auto] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3 text-xs font-black text-stone-500">
          <span>账号卡片</span>
          <span>品类</span>
          <span>粉丝数</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {loading ? (
          <div className="px-4 py-10 text-center text-sm font-semibold text-stone-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm font-semibold text-stone-500">暂无资源</div>
        ) : (
          items.map((profile) => (
            <div key={profile._id} className="grid grid-cols-[1.2fr_1fr_0.7fr_0.8fr_auto] gap-3 border-b border-stone-100 px-4 py-4 text-sm last:border-b-0">
              <div className="min-w-0">
                <div className="font-black text-stone-900">{profile.displayName}</div>
                <a className="mt-1 block truncate text-xs font-semibold text-[#6c27d6]" href={profile.socialAccount.profileUrl} target="_blank" rel="noreferrer">{profile.socialAccount.nickname || profile.socialAccount.profileUrl}</a>
                <div className="mt-1 text-xs text-stone-500">{profile.city || "未填城市"} · {profile.childStage || "未填阶段"} · {profile.childGender || "未填性别"}</div>
                <div className="mt-1 text-xs font-semibold text-stone-500">
                  {realNameLabel(profile.socialAccount.realNameVerified)}
                  {profile.socialAccount.screenshotUrl ? <a className="ml-2 text-[#6c27d6]" href={profile.socialAccount.screenshotUrl} target="_blank" rel="noreferrer">主页截图</a> : <span className="ml-2">未传截图</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(profile.categories || []).slice(0, 3).map((category) => <span key={category} className="rounded-full bg-[#f6f0ff] px-2 py-1 text-xs font-bold text-[#5e17eb]">{category}</span>)}
              </div>
              <div className="font-black text-stone-900">{toCount(profile.socialAccount?.followerCount)}</div>
              <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClass[profile.status]}`}>{statusLabel[profile.status]}</span></div>
              <button type="button" onClick={() => openEdit(profile)} className="inline-flex h-9 items-center justify-center rounded-full border border-[#e6d7ff] bg-[#f7f2ff] px-5 text-xs font-black text-[#5e17eb] shadow-sm transition hover:border-[#6c27d6] hover:bg-[#efe5ff]">
                审核/补录
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
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">{realNameLabel(editing.socialAccount.realNameVerified)}</span>
                  <span className={`rounded-full border px-2.5 py-1 ${statusClass[editing.status]}`}>{statusLabel[editing.status]}</span>
                  {editing.socialAccount.screenshotUrl ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={editing.socialAccount.screenshotUrl} target="_blank" rel="noreferrer">查看主页截图</a> : <span className="rounded-full bg-stone-100 px-2.5 py-1">未上传主页截图</span>}
                </div>
              </div>
              <button type="button" onClick={closeEdit} disabled={saving} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="text-sm font-black text-stone-900">账号审核和补录</div>
                <p className="mt-2 text-sm leading-6 text-stone-600">{editing.accountPositioning || "未填写账号定位"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-700">账号昵称<input value={manualNickname} onChange={(event) => setManualNickname(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-bold text-stone-700">粉丝数<input value={manualFollowerCount} onChange={(event) => setManualFollowerCount(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="人工补录" /></label>
                </div>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm font-bold text-stone-700">审核状态<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as MamaResourceStatus)} className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">{statusOptions.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="text-sm font-bold text-stone-700">运营备注<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-1 min-h-[96px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-bold text-stone-700">适合品类<input value={suitableCategoriesText} onChange={(event) => setSuitableCategoriesText(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-bold text-stone-700">风险标签<input value={riskTagsText} onChange={(event) => setRiskTagsText(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="需补近期账号数据、内容不稳定" /></label>
                  <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500">最近更新：{toDateText(editing.updatedAt)} · 数据来源：{editing.socialAccount.dataSource || "pending"}</div>
                </div>
                <button onClick={saveManualData} disabled={saving} className="mt-4 w-full rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">{saving ? "保存中..." : "保存审核和人工补录"}</button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {!isReviewMode && taskCreateOpen ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeTaskCreate}>
          <aside role="dialog" aria-modal="true" aria-label="创建新任务" className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
              <div>
                <div className="text-xs font-black text-stone-400">创建新任务</div>
                <h2 className="mt-1 text-xl font-black text-stone-900">上架新任务</h2>
                <div className="mt-1 text-sm font-semibold text-stone-500">设置分类标签、要求和匹配权重，提交后直接匹配已审核账号。</div>
              </div>
              <button type="button" onClick={closeTaskCreate} disabled={taskLoading || taskImageUploading} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold text-stone-700">任务标题<input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">任务类型<input value={taskDraft.category} onChange={(event) => setTaskDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="小红书评论" /></label>
                <label className="text-sm font-bold text-stone-700">单价（元）<input value={taskDraft.unitPriceYuan} onChange={(event) => setTaskDraft((current) => ({ ...current, unitPriceYuan: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">阶段<input value={taskDraft.phase} onChange={(event) => setTaskDraft((current) => ({ ...current, phase: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">数据周期<input value={taskDraft.dataCycle} onChange={(event) => setTaskDraft((current) => ({ ...current, dataCycle: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">结算周期<input value={taskDraft.settlementCycle} onChange={(event) => setTaskDraft((current) => ({ ...current, settlementCycle: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-stone-700">匹配分类标签<input value={taskDraft.matchCategoriesText} onChange={(event) => setTaskDraft((current) => ({ ...current, matchCategoriesText: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="亲子阅读、学习用品" /></label>
                <label className="text-sm font-bold text-stone-700">匹配风险标签<input value={taskDraft.matchRiskTagsText} onChange={(event) => setTaskDraft((current) => ({ ...current, matchRiskTagsText: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="内容稳定、需近期开播" /></label>
                <label className="text-sm font-bold text-stone-700">最低粉丝数<input value={taskDraft.minFollowerCount} onChange={(event) => setTaskDraft((current) => ({ ...current, minFollowerCount: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="5000" /></label>
                <label className="text-sm font-bold text-stone-700">最新数据<input value={taskDraft.latestDataDate} onChange={(event) => setTaskDraft((current) => ({ ...current, latestDataDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="2026-06-29" /></label>
              </div>
              <label className="block text-sm font-bold text-stone-700">项目链接<input value={taskDraft.externalUrl} onChange={(event) => setTaskDraft((current) => ({ ...current, externalUrl: event.target.value }))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
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
                        <img src={url} alt="" className="aspect-[4/3] w-full object-cover" />
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
              <label className="flex items-center gap-2 rounded-xl bg-[#f7f2ff] px-3 py-3 text-sm font-bold text-[#4b1db5]">
                <input type="checkbox" checked={taskDraft.autoAssign} onChange={(event) => setTaskDraft((current) => ({ ...current, autoAssign: event.target.checked }))} />
                创建后自动按任务条件匹配账号
              </label>
              {taskCreateMessage ? (
                <div className={`rounded-xl px-3 py-2 text-sm font-bold ${taskCreateMessage.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {taskCreateMessage.text}
                </div>
              ) : null}
              <button type="button" onClick={submitTaskCreate} disabled={taskLoading || taskImageUploading} className="w-full rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)] disabled:bg-stone-300 disabled:shadow-none">
                {taskLoading ? "上架中..." : "提交上架并匹配账号"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {!isReviewMode && taskManagerOpen ? (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeTaskManager}>
          <aside role="dialog" aria-modal="true" aria-label="任务上架和账号选号" className="mx-auto my-8 max-w-6xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
              <div>
                <div className="text-xs font-black text-stone-400">任务上架和账号选号</div>
                <h2 className="mt-1 text-xl font-black text-stone-900">{selectedTask?.title || "选择任务"}</h2>
                <div className="mt-1 text-sm font-semibold text-stone-500">在任务上定向选择账号，或按品类、风险标签、粉丝数筛选账号。</div>
              </div>
              <button type="button" onClick={closeTaskManager} disabled={taskLoading} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-3">
                <button type="button" onClick={openTaskCreate} disabled={taskLoading} className="w-full rounded-xl bg-[#6c27d6] px-4 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(108,39,214,0.18)] disabled:bg-stone-300 disabled:shadow-none">上架新任务</button>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <div className="mb-2 text-xs font-black text-stone-500">已上架任务</div>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <button key={task._id} type="button" onClick={() => selectTask(task)} className={`w-full rounded-xl border px-3 py-3 text-left ${selectedTask?._id === task._id ? "border-[#6c27d6] bg-[#f7f2ff]" : "border-stone-200 bg-white"}`}>
                        <div className="truncate text-sm font-black text-stone-900">{task.title}</div>
                        <div className="mt-1 text-xs font-semibold text-stone-500">{task.category || "未分类"} · {toMoneyText(task.unitPriceCents)} · {taskStatusLabel[String(task.status)] || task.status}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-stone-900">按标签筛选</div>
                      <div className="mt-1 text-xs font-semibold text-stone-500">只从已审核通过的账号中选号。</div>
                    </div>
                    <button type="button" onClick={() => selectedTask && loadTaskWorkspace(selectedTask._id)} disabled={!selectedTask || taskLoading} className="rounded-xl border border-[#6c27d6] bg-[#f7f2ff] px-3 py-2 text-xs font-black text-[#5e17eb] disabled:opacity-50">筛选账号</button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <input value={taskSearchText} onChange={(event) => setTaskSearchText(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="搜索昵称/微信/链接" />
                    <input value={taskCategoryFilter} onChange={(event) => setTaskCategoryFilter(event.target.value)} list="mama-resource-categories" className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="品类标签" />
                    <input value={taskRiskTagFilter} onChange={(event) => setTaskRiskTagFilter(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="风险标签" />
                    <input value={taskMinFollowers} onChange={(event) => setTaskMinFollowers(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" placeholder="最低粉丝数" />
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-stone-900">定向选择账号</div>
                        <div className="mt-1 text-xs font-semibold text-stone-500">已选 {selectedCandidateIds.length} 个账号</div>
                      </div>
                      <button type="button" onClick={assignSelectedTaskCandidates} disabled={!selectedTask || selectedCandidateIds.length === 0 || taskLoading} className="rounded-xl bg-[#6c27d6] px-3 py-2 text-xs font-black text-white disabled:bg-stone-300">分配给选中账号</button>
                    </div>
                    <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                      {taskLoading && candidates.length === 0 ? (
                        <div className="rounded-xl bg-stone-50 px-3 py-6 text-center text-sm font-semibold text-stone-500">账号加载中...</div>
                      ) : candidates.length === 0 ? (
                        <div className="rounded-xl bg-stone-50 px-3 py-6 text-center text-sm font-semibold text-stone-500">暂无匹配账号</div>
                      ) : candidates.map((candidate) => (
                        <label key={candidate._id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-stone-200 px-3 py-3 hover:border-[#6c27d6]">
                          <input type="checkbox" checked={selectedCandidateIds.includes(candidate._id)} disabled={Boolean(candidate.assignmentId)} onChange={() => toggleCandidate(candidate._id)} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-stone-900">{candidate.displayName}</span>
                            <span className="mt-1 block truncate text-xs font-semibold text-stone-500">{(candidate.categories || []).join("、") || "未填品类"} · 粉丝 {toCount(candidate.socialAccount?.followerCount)}</span>
                          </span>
                          {candidate.assignmentStatus ? assignmentBadge(candidate.assignmentStatus) : <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-black text-stone-500">未分配</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="mb-3 text-sm font-black text-stone-900">已分配账号</div>
                    <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                      {assignments.length === 0 ? (
                        <div className="rounded-xl bg-white px-3 py-6 text-center text-sm font-semibold text-stone-500">暂无已分配账号</div>
                      ) : assignments.map((assignment) => (
                        <div key={assignment._id} className="rounded-xl border border-stone-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-stone-900">{assignment.profile?.displayName || "未命名账号"}</div>
                              <div className="mt-1 text-xs font-semibold text-stone-500">粉丝 {toCount(assignment.profile?.socialAccount?.followerCount)} · {toDateText(assignment.updatedAt)}</div>
                            </div>
                            {assignmentBadge(assignment.status)}
                          </div>
                          {assignment.proofLink || assignment.proofScreenshotUrl ? (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                              {assignment.proofLink ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={assignment.proofLink} target="_blank" rel="noreferrer">完成链接</a> : null}
                              {assignment.proofScreenshotUrl ? <a className="rounded-full bg-[#f6f0ff] px-2.5 py-1 text-[#6c27d6]" href={assignment.proofScreenshotUrl} target="_blank" rel="noreferrer">完成截图</a> : null}
                            </div>
                          ) : <div className="mt-2 text-xs font-semibold text-stone-400">用户尚未提交证明</div>}
                          {assignment.status === "submitted" ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => reviewAssignment(assignment, "collected", "已核对链接和截图，标记收录")} disabled={taskLoading} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-stone-300">标记已收录</button>
                              <button type="button" onClick={() => reviewAssignment(assignment, "rejected", "证明材料不完整，请重新提交")} disabled={taskLoading} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-black text-stone-700 disabled:opacity-50">驳回</button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
};

const AdminMamaResourcesPage: React.FC = () => <AdminMamaResourcesPageContent mode="tasks" />;

export const AdminMamaResourceReviewPage: React.FC = () => <AdminMamaResourcesPageContent mode="review" />;

export default AdminMamaResourcesPage;
