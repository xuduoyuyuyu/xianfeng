import React, { useEffect, useMemo, useState } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { publicApi, WelfareCampaign } from "../services/api";
import { isMiniProgramWebView } from "../utils/mpAuthBridge";

function dateText(value?: string | null): string {
  if (!value) return "长期有效";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "长期有效";
  return `${date.getMonth() + 1}.${date.getDate()} 截止`;
}

function campaignCover(value?: string) {
  const source = String(value || "").trim();
  if (source.startsWith("emoji:")) return { emoji: source.slice("emoji:".length).trim(), image: "" };
  return { emoji: "", image: source || "/assets/welfare-gift-icon.png" };
}

function readableError(error: any, fallback: string): string {
  const raw = String(error?.response?.data?.message || error?.message || "").trim();
  if (/^Request failed with status code \d+$/i.test(raw)) return fallback;
  return raw || fallback;
}

function isNotFoundError(error: any): boolean {
  const status = Number(error?.response?.status || error?.status || 0);
  const raw = String(error?.response?.data?.message || error?.message || "").trim();
  return status === 404 || /Request failed with status code 404/i.test(raw);
}

function WelfareCard({
  campaign,
  onClaim,
  claimingId,
}: {
  campaign: WelfareCampaign;
  onClaim?: (campaign: WelfareCampaign) => void;
  claimingId?: string;
}) {
  const unavailable = campaign.availability === "expired" || campaign.availability === "sold_out";
  const actionText =
    campaign.availability === "expired"
      ? "已过期"
      : campaign.availability === "sold_out"
      ? "已抢完"
      : campaign.claimButtonText || "立即领取";
  const cover = campaignCover(campaign.coverImageUrl);

  return (
    <article className={`flex items-center gap-3 rounded-[26px] bg-white/92 p-4 shadow-[0_18px_44px_rgba(77,69,148,0.10)] ${unavailable ? "opacity-70" : ""}`}>
      <div className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[20px] bg-[#f1ecff]">
        {cover.emoji ? <span className="text-[30px] leading-none">{cover.emoji}</span> : <img src={cover.image} alt="" className="h-[54px] w-[54px] object-contain" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[17px] font-black leading-tight text-[#17143d]">{campaign.title || "未命名福利"}</h3>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-[1.45] text-[#8d879b]">
          {campaign.subtitle || campaign.description || `剩余 ${campaign.remainingStock} 份 · ${dateText(campaign.endsAt)}`}
        </p>
        <p className="mt-1 text-[11px] font-bold text-[#aaa3b8]">
          {unavailable ? dateText(campaign.endsAt) : `剩余 ${campaign.remainingStock} / ${campaign.totalStock} 份`}
        </p>
      </div>
      <button
        type="button"
        disabled={unavailable || claimingId === campaign._id}
        onClick={() => onClaim?.(campaign)}
        className={`min-h-[44px] shrink-0 rounded-full px-5 text-[15px] font-black ${
          unavailable
            ? "bg-[#eceaf4] text-[#9b95aa]"
            : "bg-[#5f50eb] text-white shadow-[0_10px_22px_rgba(95,80,235,0.28)]"
        }`}
      >
        {claimingId === campaign._id ? "领取中" : actionText}
      </button>
    </article>
  );
}

const WelfarePage: React.FC = () => {
  const [activeCampaigns, setActiveCampaigns] = useState<WelfareCampaign[]>([]);
  const [historyCampaigns, setHistoryCampaigns] = useState<WelfareCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [claimingId, setClaimingId] = useState("");
  const [claimDialog, setClaimDialog] = useState<{ title: string; instructions: string; externalUrl: string } | null>(null);
  const miniProgramWebView = isMiniProgramWebView();

  const hasHistory = useMemo(() => historyCampaigns.length > 0, [historyCampaigns]);

  const loadCampaigns = async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await publicApi.getWelfareCampaigns();
      setActiveCampaigns(response.data.active || []);
      setHistoryCampaigns(response.data.history || []);
    } catch (error: any) {
      if (isNotFoundError(error)) {
        setActiveCampaigns([]);
        setHistoryCampaigns([]);
        return;
      }
      setMessage(readableError(error, "福利加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const handleClaim = async (campaign: WelfareCampaign) => {
    setClaimingId(campaign._id);
    setMessage("");
    try {
      const response = await publicApi.claimWelfareCampaign(campaign._id);
      const claimedCampaign = response.data.campaign || campaign;
      setClaimDialog({
        title: claimedCampaign.title || campaign.title || "领取成功",
        instructions: claimedCampaign.claimInstructions || campaign.claimInstructions || "领取成功，运营会根据福利说明联系你。",
        externalUrl: claimedCampaign.externalUrl || campaign.externalUrl || "",
      });
      await loadCampaigns();
    } catch (error: any) {
      if (isNotFoundError(error)) {
        setMessage("这个福利暂时不可领取，稍后再看看");
        return;
      }
      setMessage(readableError(error, "领取失败，请稍后重试"));
    } finally {
      setClaimingId("");
    }
  };

  const copyClaimLink = async () => {
    const url = claimDialog?.externalUrl.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("链接已复制。");
    } catch (_error) {
      setMessage(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0edff] text-[#17143d]">
      {!miniProgramWebView ? <GlobalPublicNav compactMobile /> : null}
      <main className={`xf-welfare-main mx-auto flex min-h-screen w-full max-w-[760px] flex-col px-5 pb-10 ${miniProgramWebView ? "pt-0" : "pt-[64px]"} sm:px-6`} style={{ paddingTop: miniProgramWebView ? 0 : undefined }}>
        <section className="relative pb-5">
          <div className="absolute right-2 top-0 h-[142px] w-[142px] rounded-full bg-[#ffffff]/55 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/72 px-3 py-2 text-[12px] font-black text-[#5d52db] shadow-[0_10px_22px_rgba(82,72,160,0.10)]">
                <img src="/assets/welfare-gift-icon.png" alt="" className="h-6 w-6 object-contain" />
                我的福利
              </div>
              <h1 className="text-[36px] font-medium leading-[1.08] tracking-normal text-[#15123f]">
                小玩子百宝箱
              </h1>
              <p className="mt-3 text-[15px] font-bold leading-[1.7] text-[#8a84a0]">
                福利多多，好运多多
              </p>
            </div>
            <img src="/assets/xw-1.png" alt="小玩子" className="mt-2 h-[92px] w-[92px] shrink-0 object-contain drop-shadow-[0_16px_24px_rgba(77,69,148,0.18)]" />
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-[#5f50eb]">featured_seasonal_and_gifts</span>
            <h2 className="text-[20px] font-black text-[#15123f]">可领取福利</h2>
          </div>
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-[22px] bg-white/88 p-5 text-sm font-bold text-[#8a84a0]">正在打开百宝箱...</div>
            ) : activeCampaigns.length > 0 ? (
              activeCampaigns.map((campaign) => <WelfareCard key={campaign._id} campaign={campaign} onClaim={handleClaim} claimingId={claimingId} />)
            ) : (
              <div className="rounded-[22px] bg-white/88 p-5 text-sm font-bold text-[#8a84a0]">今天没有新的福利，过几天再来看看。</div>
            )}
          </div>
        </section>

        {message ? (
          <div className="mt-4 rounded-[20px] bg-white/85 px-4 py-3 text-[13px] font-bold leading-[1.6] text-[#5e43e6] shadow-[0_10px_24px_rgba(77,69,148,0.08)]">
            {message}
          </div>
        ) : null}

        {hasHistory ? (
          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-black text-[#15123f]">历史福利</h2>
              <span className="text-[12px] font-black text-[#9b95aa]">历史内容</span>
            </div>
            <div className="grid gap-3">
              {historyCampaigns.map((campaign) => (
                <WelfareCard key={campaign._id} campaign={campaign} claimingId={claimingId} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      {claimDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#120e25]/35 px-5" role="dialog" aria-modal="true">
          <div className="w-full max-w-[420px] rounded-[28px] bg-white p-5 shadow-2xl">
            <p className="text-xs font-black text-[#5e43e6]">领取成功</p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-[#15123f]">{claimDialog.title}</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#5f5a72]">{claimDialog.instructions}</p>
            {claimDialog.externalUrl ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f5f2ff] p-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#5e43e6]">{claimDialog.externalUrl}</span>
                <button type="button" onClick={copyClaimLink} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-[#5e43e6]">
                  复制链接
                </button>
              </div>
            ) : null}
            <button type="button" onClick={() => setClaimDialog(null)} className="mt-5 w-full rounded-full bg-[#5f50eb] px-4 py-3 text-sm font-black text-white">
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WelfarePage;
