import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import WishModal from "../components/WishModal";
import { publicApi, PublicGuest } from "../services/api";

const PAGE_SIZE = 15;
const FALLBACK_AVATAR = "https://xianfeng.xinzhi.info/uploads/images/1779099163792-wl2rg1zt.png";
const EXPERTS_HERO_DISMISSED_KEY = "experts_hero_dismissed_v1";

const ExpertsPage: React.FC = () => {
  const [guests, setGuests] = useState<PublicGuest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHero, setShowHero] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [wishModalOpen, setWishModalOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    try {
      setShowHero(window.localStorage.getItem(EXPERTS_HERO_DISMISSED_KEY) !== "1");
    } catch (_err) {
      setShowHero(true);
    }
  }, []);

  const dismissHero = () => {
    setShowHero(false);
    try {
      window.localStorage.setItem(EXPERTS_HERO_DISMISSED_KEY, "1");
    } catch (_err) {}
  };

  // 从 URL search params 读取搜索和分页
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const p = Number(searchParams.get("page"));
    setSearch(q);
    setPage(Number.isFinite(p) && p > 0 ? Math.floor(p) : 1);
  }, []);

  // 加载数据
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getGuests({ search: search || undefined, page: safePage, pageSize: PAGE_SIZE })
      .then((response) => {
        if (!alive) return;
        const data = response.data;
        const list = Array.isArray(data) ? data : (data.guests || []);
        setGuests(list);
        setTotal(data.total ?? list.length);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "加载先疯智库失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [safePage, search]);

  // 同步 page 到 search
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  // 更新 URL search params
  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (safePage > 1) next.set("page", String(safePage));
    setSearchParams(next, { replace: true });
  }, [search, safePage, setSearchParams]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* ExpertsPage: large flowing gradient waves + layered grid */}
      <style>{`
        @keyframes expWave1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .6; }
          30% { transform: translate3d(3%,-2%,0) scale(1.08); opacity: .85; }
          70% { transform: translate3d(-2%,1.5%,0) scale(.94); opacity: .7; }
        }
        @keyframes expWave2 {
          0%,100% { transform: translate3d(0,0,0) scale(.95); opacity: .5; }
          50% { transform: translate3d(-2.5%,2%,0) scale(1.15); opacity: .78; }
        }
        @keyframes expWave3 {
          0%,100% { transform: translate3d(0,0,0) scale(1.02); opacity: .5; }
          40% { transform: translate3d(2%,-1.5%,0) scale(.9); opacity: .75; }
          85% { transform: translate3d(-1.5%,2.5%,0) scale(1.18); opacity: .82; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(118,83,205,0.06)_2px,transparent_2px),linear-gradient(90deg,rgba(118,83,205,0.04)_2px,transparent_2px)] bg-[size:50px_50px]" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -left-20 h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.15),transparent_58%)]" style={{ animation: "expWave1 12s ease-in-out infinite" }} />
        <div className="absolute top-[35%] -right-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(129,75,255,0.11),transparent_60%)]" style={{ animation: "expWave2 16s ease-in-out infinite 3s" }} />
        <div className="absolute -bottom-24 left-[25%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(153,102,255,0.1),transparent_55%)]" style={{ animation: "expWave3 14s ease-in-out infinite 6s" }} />
      </div>
      <GlobalPublicNav
        compactMobile
        showSearch
        searchPlaceholder="搜索嘉宾姓名/头衔/研究方向"
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
      />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        {showHero ? (
          <section className="group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_top_left,_rgba(143,100,255,0.12),_transparent_32%),linear-gradient(135deg,_#f4f1fd_0%,_#fff_52%,_#f0ebff_100%)] p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)] sm:p-10">
            <button
              type="button"
              onClick={dismissHero}
              aria-label="关闭引导卡片"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#cfc2ee] bg-white/75 text-[#5b3fa1] opacity-0 transition hover:bg-white hover:text-[#4e36a0] group-hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 max-sm:opacity-100"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#5b3fa1]">
                Experts
              </div>
              <h1 className="mt-5 text-4xl font-black leading-[1.14] tracking-tight text-[#241a3a] sm:text-5xl">
                跟随分享者的视角，往更深、更广的维度延展思索
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f66ad] sm:text-base">
                从节目延伸到人物。这里汇总节目中嘉宾的背景信息、著作、公开参考链接与拓展内容，帮助你更快判断这位嘉宾的经验、方法与视角是否适合当前问题。
              </p>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div>
        ) : null}

        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-[1.7rem] border border-[#e2dcf0] bg-white p-5">
                <div className="h-48 rounded-[1.4rem] bg-[#ece3f7]" />
                <div className="mt-4 h-6 w-2/3 rounded bg-[#ece3f7]" />
                <div className="mt-3 h-4 w-1/2 rounded bg-[#ece3f7]" />
                <div className="mt-4 h-16 rounded bg-[#ece3f7]" />
              </div>
            ))
          ) : guests.length === 0 ? (
            <div className="col-span-full rounded-[1.7rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center text-sm text-[#8e81b3]">
              暂无符合条件的嘉宾资料。
            </div>
          ) : (
            guests.map((guest) => (
              <Link
                key={guest._id}
                to={`/experts/${encodeURIComponent(guest._id)}`}
                className="group overflow-hidden rounded-[1.7rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_20px_60px_rgba(63,38,112,0.06)] transition hover:-translate-y-1 hover:border-[#b79bff] hover:shadow-[0_28px_80px_rgba(63,38,112,0.12)]"
              >
                <div className="relative overflow-hidden rounded-[1.4rem] bg-[linear-gradient(135deg,_#1f143a,_#4b1db2_44%,_#b79bff)]">
                  <img
                    src={guest.avatar || FALLBACK_AVATAR}
                    alt={guest.name || "嘉宾头像"}
                    className="h-56 w-full object-cover transition duration-700 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.src = FALLBACK_AVATAR;
                    }}
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#5e17eb]">
                    Guest Archive
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-baseline gap-3 whitespace-nowrap">
                    <h2 className="min-w-0 truncate text-2xl leading-none font-black tracking-tight text-[#24180a]">{guest.name || "未命名嘉宾"}</h2>
                    <span className="shrink-0 text-xs leading-none font-black uppercase tracking-[0.22em] text-[#5e17eb]">{guest.title || "节目嘉宾"}</span>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#6f66ad]">{guest.bio || "暂无简介，后续可在后台补充嘉宾公开资料与人物介绍。"}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    关联节目 {guest.programCount || 0}
                  </span>
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    公开资料 {guest.referenceCount || 0}
                  </span>
                </div>
              </Link>
            ))
          )}
        </section>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />

        {/* 许愿入口 — 列表页底部小字 */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setWishModalOpen(true)}
            className="transition hover:text-[#5e17eb]"
            style={{ fontSize: 7.7, color: "#b7a9d6" }}
          >
            🙏 女施主又来许愿了
          </button>
        </div>

        <WishModal
          open={wishModalOpen}
          onClose={() => setWishModalOpen(false)}
          guestId="guest-list"
        />
      </main>
    </div>
  );
};

export default ExpertsPage;
