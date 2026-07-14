import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, WelfareCampaign, WelfareCampaignInput, WelfareClaim, WelfareCampaignStatus } from "../../services/api";

type WelfareForm = {
  title: string;
  subtitle: string;
  coverImageUrl: string;
  claimInstructions: string;
  externalUrl: string;
  claimButtonText: string;
  totalStock: string;
  startsAt: string;
  endsAt: string;
  status: WelfareCampaignStatus;
  sortOrder: string;
};

const emptyForm: WelfareForm = {
  title: "",
  subtitle: "",
  coverImageUrl: "/assets/welfare-gift-icon.png",
  claimInstructions: "",
  externalUrl: "",
  claimButtonText: "立即领取",
  totalStock: "10",
  startsAt: "",
  endsAt: "",
  status: "draft",
  sortOrder: "0",
};

const coverEmojiOptions = ["🎁", "📚", "🧸", "🎫", "⭐", "🍬", "🪄", "🏆"];
const maxCoverImageBytes = 1024 * 1024;

const statusLabel: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  hidden: "已隐藏",
  archived: "已归档",
  active: "可领取",
  expired: "已过期",
  sold_out: "已抢完",
  upcoming: "未开始",
};

function toInputDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function toForm(campaign: WelfareCampaign): WelfareForm {
  return {
    title: campaign.title || "",
    subtitle: campaign.subtitle || "",
    coverImageUrl: campaign.coverImageUrl || "/assets/welfare-gift-icon.png",
    claimInstructions: campaign.claimInstructions || "",
    externalUrl: campaign.externalUrl || "",
    claimButtonText: campaign.claimButtonText || "立即领取",
    totalStock: String(campaign.totalStock ?? 0),
    startsAt: toInputDate(campaign.startsAt),
    endsAt: toInputDate(campaign.endsAt),
    status: campaign.status || "draft",
    sortOrder: String(campaign.sortOrder ?? 0),
  };
}

function toPayload(form: WelfareForm): WelfareCampaignInput {
  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim(),
    coverImageUrl: form.coverImageUrl.trim(),
    claimInstructions: form.claimInstructions.trim(),
    externalUrl: form.externalUrl.trim(),
    claimButtonText: form.claimButtonText.trim() || "立即领取",
    totalStock: form.totalStock,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    status: form.status,
    sortOrder: form.sortOrder,
  };
}

function renderCoverPreview(value: string, className = "h-14 w-14") {
  const source = String(value || "").trim();
  if (source.startsWith("emoji:")) {
    return <span className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-[#f1ecff] text-3xl`}>{source.slice("emoji:".length)}</span>;
  }
  return <img src={source || "/assets/welfare-gift-icon.png"} alt="" className={`${className} shrink-0 rounded-2xl bg-[#f1ecff] object-contain p-1`} />;
}

function safeFileName(value: string) {
  return (String(value || "").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 60) || "福利领取记录");
}

const AdminWelfarePage: React.FC = () => {
  const [items, setItems] = useState<WelfareCampaign[]>([]);
  const [form, setForm] = useState<WelfareForm>(emptyForm);
  const [editing, setEditing] = useState<WelfareCampaign | null>(null);
  const [claims, setClaims] = useState<WelfareClaim[]>([]);
  const [claimCampaign, setClaimCampaign] = useState<WelfareCampaign | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingCodes, setImportingCodes] = useState(false);
  const [exportingClaims, setExportingClaims] = useState(false);
  const [activationCodeText, setActivationCodeText] = useState("");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedItems = useMemo(() => items, [items]);

  const loadItems = async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await adminApi.getAdminWelfareCampaigns();
      setItems(response.data.items || []);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "福利活动加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const updateField = <K extends keyof WelfareForm>(key: K, value: WelfareForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setActivationCodeText("");
    setMessage("");
    setFormModalOpen(true);
  };

  const openEdit = (campaign: WelfareCampaign) => {
    setEditing(campaign);
    setForm(toForm(campaign));
    setActivationCodeText("");
    setMessage("");
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    if (saving || uploading || importingCodes) return;
    setFormModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setActivationCodeText("");
  };

  const uploadCoverImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > maxCoverImageBytes) {
      setMessage("封面图片不能超过 1MB，请压缩后再上传。");
      event.target.value = "";
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const response = await adminApi.uploadAdminImage(file);
      updateField("coverImageUrl", response.data.url);
      setMessage("封面已上传。");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "封面上传失败");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const requestedStock = Math.max(0, Math.floor(Number(form.totalStock) || 0));
      const response = editing
        ? await adminApi.updateWelfareCampaign(editing._id, toPayload(form))
        : await adminApi.createWelfareCampaign(toPayload(form));
      const savedCampaign = response.data.campaign;
      const stockAdjusted = savedCampaign.totalStock !== requestedStock;
      setFormModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadItems();
      setMessage(stockAdjusted
        ? `库存已按激活码数量调整为 ${savedCampaign.totalStock}。`
        : "百宝箱福利已保存。");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const importActivationCodes = async () => {
    if (!editing || importingCodes) return;
    setImportingCodes(true);
    setMessage("");
    try {
      const response = await adminApi.importWelfareActivationCodes(editing._id, { codesText: activationCodeText });
      setActivationCodeText("");
      setEditing(response.data.campaign);
      await loadItems();
      const skippedText = response.data.skippedCount ? `，跳过 ${response.data.skippedCount} 个重复码` : "";
      setMessage(`已导入 ${response.data.importedCount} 个激活码${skippedText}。`);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "激活码导入失败");
    } finally {
      setImportingCodes(false);
    }
  };

  const openClaims = async (campaign: WelfareCampaign) => {
    setClaimCampaign(campaign);
    setClaims([]);
    try {
      const response = await adminApi.getAdminWelfareClaims(campaign._id);
      setClaims(response.data.claims || []);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "领取记录加载失败");
    }
  };

  const exportClaims = async () => {
    if (!claimCampaign || exportingClaims) return;
    setExportingClaims(true);
    setMessage("");
    try {
      const response = await adminApi.exportAdminWelfareClaims(claimCampaign._id);
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(claimCampaign.title)}-领取对账.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "领取记录导出失败");
    } finally {
      setExportingClaims(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#7a6ee6]">Welfare</p>
          <h1 className="mt-1 text-3xl font-black text-[#171321]">百宝箱</h1>
          <p className="mt-2 text-sm font-medium text-stone-500">配置前台福利、库存、活动时间和领取说明。</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#5e17eb] px-4 py-2 text-sm font-black text-white">
          新建福利
        </button>
      </header>

      {message ? <div className="rounded-xl border border-[#d9cffd] bg-[#f8f5ff] px-4 py-3 text-sm font-bold text-[#5e17eb]">{message}</div> : null}

      <div>
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-[#171321]">福利活动</h2>
          <div className="mt-4 grid gap-3">
            {loading ? (
              <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">加载中...</div>
            ) : sortedItems.length === 0 ? (
              <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">暂无福利活动。</div>
            ) : (
              sortedItems.map((item) => (
                <article key={item._id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-start gap-3">
                    {renderCoverPreview(item.coverImageUrl || "/assets/welfare-gift-icon.png")}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-[#171321]">{item.title}</h3>
                        <span className="rounded-full bg-[#f4f1ff] px-2 py-1 text-xs font-black text-[#5e17eb]">{statusLabel[item.availability] || item.availability}</span>
                        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-black text-stone-600">{statusLabel[item.status] || item.status}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-stone-500">{item.subtitle || "未填写副标题"}</p>
                      <p className="mt-2 text-xs font-bold text-stone-500">
                        库存 {item.remainingStock}/{item.totalStock} · 已领取 {item.claimedCount}
                        {item.activationCodeCount ? ` · 激活码 ${item.activationCodeRemainingCount}/${item.activationCodeCount}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => openEdit(item)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black text-stone-700">编辑</button>
                      <button type="button" onClick={() => openClaims(item)} className="rounded-xl border border-[#5e17eb]/20 bg-[#f7f2ff] px-3 py-2 text-xs font-black text-[#5e17eb]">领取记录</button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {formModalOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/35 p-4 backdrop-blur-sm" onClick={closeFormModal}>
          <aside role="dialog" aria-modal="true" aria-label={editing ? "编辑福利" : "上传福利活动"} className="mx-auto my-8 max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {renderCoverPreview(form.coverImageUrl)}
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-[#171321]">{editing ? "编辑福利" : "上传福利活动"}</h2>
                  <p className="mt-1 text-xs font-bold text-stone-500">配置封面、库存、活动时间和领取说明</p>
                </div>
              </div>
              <button type="button" onClick={closeFormModal} disabled={saving || uploading} className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50" aria-label="关闭">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={saveCampaign} className="max-h-[calc(100vh-180px)] overflow-y-auto p-5">
              <div className="grid gap-3">
                <label className="text-xs font-black text-stone-600">
                  标题
                  <input className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" value={form.title} onChange={(event) => updateField("title", event.target.value)} />
                </label>
                <label className="text-xs font-black text-stone-600">
                  副标题
                  <input className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" value={form.subtitle} onChange={(event) => updateField("subtitle", event.target.value)} />
                </label>
                <label className="text-xs font-black text-stone-600">
                  领取说明
                  <textarea className="mt-1 min-h-[78px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.claimInstructions} onChange={(event) => updateField("claimInstructions", event.target.value)} />
                </label>
                <label className="text-xs font-black text-stone-600">
                  外部链接
                  <input className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" value={form.externalUrl} onChange={(event) => updateField("externalUrl", event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-black text-stone-600">
                    总库存
                    <input className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" inputMode="numeric" value={form.totalStock} onChange={(event) => updateField("totalStock", event.target.value)} />
                  </label>
                  <label className="text-xs font-black text-stone-600">
                    排序
                    <input className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" inputMode="numeric" value={form.sortOrder} onChange={(event) => updateField("sortOrder", event.target.value)} />
                  </label>
                </div>
                <section className="rounded-2xl border border-[#e6ddff] bg-[#fbf9ff] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-[#171321]">激活码</h3>
                      <p className="mt-1 text-xs font-bold text-stone-500">
                        {editing
                          ? `已导入 ${editing.activationCodeCount || 0} 个 · 已绑定 ${editing.activationCodeClaimedCount || 0} 个 · 剩余 ${editing.activationCodeRemainingCount || 0} 个`
                          : "保存福利后可导入激活码。"}
                      </p>
                    </div>
                    {editing ? (
                      <button
                        type="button"
                        onClick={importActivationCodes}
                        disabled={importingCodes || !activationCodeText.trim()}
                        className="rounded-xl bg-[#5e17eb] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        {importingCodes ? "导入中..." : "导入激活码"}
                      </button>
                    ) : null}
                  </div>
                  {editing ? (
                    <textarea
                      className="mt-3 min-h-[92px] w-full rounded-xl border border-[#d8ccff] bg-white px-3 py-2 text-sm"
                      value={activationCodeText}
                      onChange={(event) => setActivationCodeText(event.target.value)}
                      placeholder="每行一个激活码，也支持逗号分隔；重复码会自动跳过"
                    />
                  ) : null}
                </section>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-black text-stone-600">
                    开始时间
                    <input type="datetime-local" className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} />
                  </label>
                  <label className="text-xs font-black text-stone-600">
                    结束时间
                    <input type="datetime-local" className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm" value={form.endsAt} onChange={(event) => updateField("endsAt", event.target.value)} />
                  </label>
                </div>
                <label className="text-xs font-black text-stone-600">
                  状态
                  <select className="mt-1 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm" value={form.status} onChange={(event) => updateField("status", event.target.value as WelfareCampaignStatus)}>
                    <option value="draft">草稿</option>
                    <option value="published">发布</option>
                    <option value="hidden">隐藏</option>
                    <option value="archived">归档</option>
                  </select>
                </label>
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {coverEmojiOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => updateField("coverImageUrl", `emoji:${emoji}`)}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border text-xl ${form.coverImageUrl === `emoji:${emoji}` ? "border-[#5e17eb] bg-[#f2ecff]" : "border-stone-200 bg-white"}`}
                        aria-label={`选择 ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadCoverImage} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-[#5e17eb]/20 bg-[#f7f2ff] px-3 py-2 text-sm font-black text-[#5e17eb]">
                    <span className="material-symbols-outlined text-base">upload_file</span>
                    {uploading ? "上传中..." : "上传封面"}
                  </button>
                </div>
                <div className="sticky bottom-0 -mx-5 mt-2 flex justify-end gap-3 border-t border-stone-100 bg-white px-5 py-4">
                  <button type="button" disabled={saving || uploading} onClick={closeFormModal} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-stone-700 disabled:opacity-50">
                    取消
                  </button>
                  <button type="submit" disabled={saving} className="rounded-xl bg-[#5e17eb] px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                    {saving ? "保存中..." : "保存福利"}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {claimCampaign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#171321]">领取记录</h2>
                <p className="text-sm font-medium text-stone-500">{claimCampaign.title}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={exportClaims} disabled={exportingClaims} className="rounded-full border border-[#5e17eb]/20 bg-[#f7f2ff] px-3 py-1 text-sm font-black text-[#5e17eb] disabled:opacity-50">
                  {exportingClaims ? "导出中..." : "导出对账"}
                </button>
                <button type="button" onClick={() => setClaimCampaign(null)} className="rounded-full border border-stone-200 px-3 py-1 text-sm font-black text-stone-600">关闭</button>
              </div>
            </div>
            <div className="grid gap-2">
              {claims.length === 0 ? (
                <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">暂无领取记录。</div>
              ) : (
                claims.map((claim) => (
                  <div key={claim._id} className="rounded-xl border border-stone-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-black text-[#171321]">{claim.user?.nickname || claim.user?.username || "未命名用户"}</div>
                      <div className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">ID {claim.userId}</div>
                    </div>
                    <div className="mt-1 text-xs font-bold text-stone-500">
                      手机 {claim.user?.mobile || "未绑定"} · 状态 {claim.status} · {claim.claimedAt || claim.createdAt || "未记录时间"}
                    </div>
                    <div className="mt-1 text-xs font-black text-[#5e17eb]">激活码 {claim.activationCode || "未绑定"}</div>
                    {claim.children?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {claim.children.map((child) => (
                          <span key={`${claim._id}-${child.id || child.name}`} className="rounded-full bg-[#f7f2ff] px-2 py-1 text-xs font-black text-[#5e17eb]">
                            {[child.name, child.age, child.grade].filter(Boolean).join(" · ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminWelfarePage;
