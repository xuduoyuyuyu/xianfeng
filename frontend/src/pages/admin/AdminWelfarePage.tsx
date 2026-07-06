import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, WelfareCampaign, WelfareCampaignInput, WelfareClaim, WelfareCampaignStatus } from "../../services/api";

type WelfareForm = {
  title: string;
  subtitle: string;
  description: string;
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
  description: "",
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
    description: campaign.description || "",
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
    description: form.description.trim(),
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

const AdminWelfarePage: React.FC = () => {
  const [items, setItems] = useState<WelfareCampaign[]>([]);
  const [form, setForm] = useState<WelfareForm>(emptyForm);
  const [editing, setEditing] = useState<WelfareCampaign | null>(null);
  const [claims, setClaims] = useState<WelfareClaim[]>([]);
  const [claimCampaign, setClaimCampaign] = useState<WelfareCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    setMessage("");
  };

  const openEdit = (campaign: WelfareCampaign) => {
    setEditing(campaign);
    setForm(toForm(campaign));
    setMessage("");
  };

  const uploadCoverImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
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
      if (editing) {
        await adminApi.updateWelfareCampaign(editing._id, toPayload(form));
      } else {
        await adminApi.createWelfareCampaign(toPayload(form));
      }
      openCreate();
      await loadItems();
      setMessage("小玩子百宝箱福利已保存。");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "保存失败");
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#7a6ee6]">Welfare</p>
          <h1 className="mt-1 text-3xl font-black text-[#171321]">小玩子百宝箱</h1>
          <p className="mt-2 text-sm font-medium text-stone-500">配置前台福利、库存、活动时间和领取说明。</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#5e17eb] px-4 py-2 text-sm font-black text-white">
          新建福利
        </button>
      </header>

      {message ? <div className="rounded-xl border border-[#d9cffd] bg-[#f8f5ff] px-4 py-3 text-sm font-bold text-[#5e17eb]">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={saveCampaign} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <img src={form.coverImageUrl || "/assets/welfare-gift-icon.png"} alt="" className="h-14 w-14 rounded-2xl bg-[#f1ecff] object-contain p-1" />
            <div>
              <h2 className="text-lg font-black text-[#171321]">{editing ? "编辑福利" : "上传福利活动"}</h2>
              <p className="text-xs font-bold text-stone-500">推荐使用图一礼物 icon 或福利封面图</p>
            </div>
          </div>

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
              描述
              <textarea className="mt-1 min-h-[78px] w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
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
              <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadCoverImage} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-[#5e17eb]/20 bg-[#f7f2ff] px-3 py-2 text-sm font-black text-[#5e17eb]">
                <span className="material-symbols-outlined text-base">upload_file</span>
                {uploading ? "上传中..." : "上传封面"}
              </button>
            </div>
            <button type="submit" disabled={saving} className="mt-2 rounded-xl bg-[#5e17eb] px-4 py-3 text-sm font-black text-white disabled:opacity-60">
              {saving ? "保存中..." : "保存福利"}
            </button>
          </div>
        </form>

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
                    <img src={item.coverImageUrl || "/assets/welfare-gift-icon.png"} alt="" className="h-14 w-14 rounded-2xl bg-[#f1ecff] object-contain p-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-[#171321]">{item.title}</h3>
                        <span className="rounded-full bg-[#f4f1ff] px-2 py-1 text-xs font-black text-[#5e17eb]">{statusLabel[item.availability] || item.availability}</span>
                        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-black text-stone-600">{statusLabel[item.status] || item.status}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-stone-500">{item.subtitle || item.description || "未填写描述"}</p>
                      <p className="mt-2 text-xs font-bold text-stone-500">
                        库存 {item.remainingStock}/{item.totalStock} · 已领取 {item.claimedCount}
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

      {claimCampaign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#171321]">领取记录</h2>
                <p className="text-sm font-medium text-stone-500">{claimCampaign.title}</p>
              </div>
              <button type="button" onClick={() => setClaimCampaign(null)} className="rounded-full border border-stone-200 px-3 py-1 text-sm font-black text-stone-600">关闭</button>
            </div>
            <div className="grid gap-2">
              {claims.length === 0 ? (
                <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">暂无领取记录。</div>
              ) : (
                claims.map((claim) => (
                  <div key={claim._id} className="rounded-xl border border-stone-200 p-3 text-sm">
                    <div className="font-black text-[#171321]">用户 {claim.userId}</div>
                    <div className="mt-1 text-xs font-bold text-stone-500">状态 {claim.status} · {claim.claimedAt || claim.createdAt || "未记录时间"}</div>
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
