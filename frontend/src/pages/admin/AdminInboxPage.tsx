import React, { useEffect, useMemo, useState } from "react";
import { adminApi, InboxMessage } from "../../services/api";
import TopAlert from "../../components/TopAlert";

const TASK_TYPE_OPTIONS: Array<{ value: "all" | InboxMessage["taskType"]; label: string }> = [
  { value: "all", label: "全部任务" },
  { value: "proofread_transcript", label: "文稿校对" },
  { value: "enrich_program_content", label: "资料收集" },
  { value: "generate_program_artwork", label: "节目配图" },
  { value: "enrich_guest_profile", label: "嘉宾资料" },
  { value: "program_parse", label: "节目解析" },
];

const STATUS_OPTIONS: Array<{ value: "all" | InboxMessage["taskStatus"]; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "succeeded", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

function formatTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

const statusColor = (status?: InboxMessage["taskStatus"]) => {
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "canceled") return "bg-stone-100 text-stone-600 border-stone-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

function getGeneratedCoverImage(payload: unknown): string {
  const output = (payload && typeof payload === "object" ? (payload as any).output : null) || null;
  const url = typeof output?.generatedCoverImage === "string" ? output.generatedCoverImage.trim() : "";
  return url;
}

function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s"'`<>]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s"'`<>]+$/i.test(part)) {
      return (
        <a
          key={`${part}-${idx}`}
          href={part}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded bg-[#f5edff] px-1 text-[#5e17eb] underline decoration-[#5e17eb]/60 underline-offset-2 hover:bg-[#ede0ff]"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
  });
}

const AdminInboxPage: React.FC = () => {
  const [items, setItems] = useState<InboxMessage[]>([]);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [taskType, setTaskType] = useState<"all" | InboxMessage["taskType"]>("all");
  const [status, setStatus] = useState<"all" | InboxMessage["taskStatus"]>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const selectedPayloadText = useMemo(
    () => JSON.stringify(selected?.payload || {}, null, 2),
    [selected?.payload]
  );
  const selectedGeneratedCoverImage = useMemo(
    () => getGeneratedCoverImage(selected?.payload),
    [selected?.payload]
  );
  const isGeneratedCoverDataImage = selectedGeneratedCoverImage.startsWith("data:image/");

  const query = useMemo(() => ({
    page: 1,
    pageSize: 100,
    task_type: taskType === "all" ? undefined : taskType,
    status: status === "all" ? undefined : status,
  }), [taskType, status]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.listInboxMessages(query);
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setUnreadCount(Number(response.data?.unreadCount || 0));
      setSelected((prev) => {
        if (!prev) return null;
        return (response.data?.items || []).find((x) => x._id === prev._id) || null;
      });
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "加载站内信失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query.task_type, query.status]);

  const markRead = async (id: string) => {
    try {
      await adminApi.markInboxMessageRead(id);
      setItems((prev) => prev.map((item) => (item._id === id ? { ...item, isRead: true } : item)));
      setSelected((prev) => (prev && prev._id === id ? { ...prev, isRead: true } : prev));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "标记已读失败");
    }
  };

  const markAllRead = async () => {
    try {
      await adminApi.markAllInboxRead();
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setSelected((prev) => (prev ? { ...prev, isRead: true } : prev));
      setUnreadCount(0);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "全部已读失败");
    }
  };

  return (
    <div className="space-y-5">
      <TopAlert message={error} onClose={() => setError(null)} />

      <section className="rounded-3xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as any)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
            >
              {TASK_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button
              type="button"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              onClick={() => void load()}
            >
              刷新
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#5e17eb]/10 px-3 py-1 text-xs font-bold text-[#5e17eb]">未读 {unreadCount}</span>
            <button
              type="button"
              className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
              onClick={markAllRead}
              disabled={unreadCount <= 0}
            >
              全部已读
            </button>
          </div>
        </div>

        <div>
          <div className="max-h-[68vh] space-y-2 overflow-auto pr-1">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">加载中...</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">暂无消息</div>
            ) : items.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => setSelected(item)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:bg-stone-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-900">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-stone-500">{item.summary || "无摘要"}</p>
                  </div>
                  {!item.isRead ? <span className="mt-1 size-2 rounded-full bg-[#5e17eb]" /> : null}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">
                  <span className={`rounded-full border px-2 py-0.5 ${statusColor(item.taskStatus)}`}>{item.taskStatus}</span>
                  <span>{item.targetTitle || item.targetType}</span>
                  <span>{formatTime(item.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="w-full max-w-4xl rounded-3xl bg-white p-5 shadow-2xl md:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-black text-stone-900">消息详情</div>
              <div className="flex items-center gap-2">
                {!selected.isRead ? (
                  <button
                    type="button"
                    onClick={() => void markRead(selected._id)}
                    className="rounded-full border border-[#5e17eb]/30 bg-[#faf7ff] px-3 py-1 text-xs font-bold text-[#5e17eb]"
                  >
                    标记已读
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="material-symbols-outlined rounded-full border border-stone-200 p-1.5 text-stone-500 hover:text-stone-800"
                >
                  close
                </button>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-stone-500">标题</p>
                <p className="font-bold text-stone-900">{selected.title}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">摘要</p>
                <p className="whitespace-pre-wrap text-stone-700">{selected.summary || "无"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-stone-600">
                <div><span className="text-stone-400">任务类型：</span>{selected.taskType}</div>
                <div><span className="text-stone-400">状态：</span>{selected.taskStatus}</div>
                <div><span className="text-stone-400">对象：</span>{selected.targetType}</div>
                <div><span className="text-stone-400">时间：</span>{formatTime(selected.createdAt)}</div>
              </div>
              <div>
                <p className="mb-1 text-xs text-stone-500">结果快照</p>
                {selectedGeneratedCoverImage ? (
                  <div className="mb-3 rounded-xl border border-[#5e17eb]/20 bg-[#faf7ff] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-[#5e17eb]">检测到生成封面链接</p>
                      <button
                        type="button"
                        className="rounded-full border border-[#5e17eb]/30 bg-white px-3 py-1 text-[11px] font-bold text-[#5e17eb] hover:bg-[#f5edff]"
                        onClick={() => window.open(selectedGeneratedCoverImage, "_blank", "noopener,noreferrer")}
                      >
                        预览配图
                      </button>
                    </div>
                    {!isGeneratedCoverDataImage ? (
                      <a
                        href={selectedGeneratedCoverImage}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 block break-all rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-[#5e17eb] underline decoration-[#5e17eb]/60 underline-offset-2"
                      >
                        {selectedGeneratedCoverImage}
                      </a>
                    ) : null}
                    {isGeneratedCoverDataImage ? (
                      <img
                        src={selectedGeneratedCoverImage}
                        alt="生成封面预览"
                        className="mt-3 max-h-[240px] rounded-lg border border-stone-200 bg-white object-contain"
                      />
                    ) : null}
                  </div>
                ) : null}
                <pre className="max-h-[56vh] overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[12px] leading-6 text-stone-700 whitespace-pre-wrap break-words">
                  {selectedPayloadText.split("\n").map((line, idx) => (
                    <div key={`line-${idx}`}>{renderWithLinks(line)}</div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminInboxPage;
