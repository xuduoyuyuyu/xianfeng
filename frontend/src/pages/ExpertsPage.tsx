import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { publicApi, PublicGuest } from "../services/api";

const FALLBACK_AVATAR = "/assets/podcast-cover-1.svg";

const ExpertsPage: React.FC = () => {
  const [guests, setGuests] = useState<PublicGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getGuests()
      .then((response) => {
        if (!alive) return;
        setGuests(Array.isArray(response.data) ? response.data : []);
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
  }, []);

  const filteredGuests = useMemo(() => {
    const keyword = String(search || "").trim().toLowerCase();
    if (!keyword) return guests;
    return guests.filter((item) =>
      `${item.name || ""} ${item.title || ""} ${item.bio || ""}`.toLowerCase().includes(keyword)
    );
  }, [guests, search]);

  return (
    <div className="min-h-screen bg-[#f6f2eb] text-[#1f1d1a]">
      <GlobalPublicNav
        compactMobile
        showSearch
        searchPlaceholder="搜索嘉宾姓名/头衔/研究方向"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-[#e8ded1] bg-[radial-gradient(circle_at_top_left,_rgba(202,138,4,0.14),_transparent_32%),linear-gradient(135deg,_#fffaf4_0%,_#fff_52%,_#f8f1e8_100%)] p-8 shadow-[0_24px_80px_rgba(83,60,27,0.08)] sm:p-10">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-[#d4b37f] bg-[#fff7ea] px-4 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#9a6700]">
              先疯智库
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.14] tracking-tight text-[#24180a] sm:text-5xl">
              跟随分享者的视角，往更深、更广的维度延展思索
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f665d] sm:text-base">
              从节目延伸到人物。这里汇总《家长先疯》节目中已入库嘉宾的基础信息、公开参考链接与关联节目，帮助你更快判断这位嘉宾的经验、方法与视角是否适合当前问题。
            </p>
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div>
        ) : null}

        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-[1.7rem] border border-[#ece5db] bg-white p-5">
                <div className="h-48 rounded-[1.4rem] bg-[#f2ece3]" />
                <div className="mt-4 h-6 w-2/3 rounded bg-[#f2ece3]" />
                <div className="mt-3 h-4 w-1/2 rounded bg-[#f2ece3]" />
                <div className="mt-4 h-16 rounded bg-[#f2ece3]" />
              </div>
            ))
          ) : filteredGuests.length === 0 ? (
            <div className="col-span-full rounded-[1.7rem] border border-dashed border-[#e5d8c8] bg-white px-6 py-12 text-center text-sm text-[#8e8173]">
              暂无符合条件的嘉宾资料。
            </div>
          ) : (
            filteredGuests.map((guest) => (
              <Link
                key={guest._id}
                to={`/experts/${encodeURIComponent(guest._id)}`}
                className="group overflow-hidden rounded-[1.7rem] border border-[#ece5db] bg-white p-5 shadow-[0_20px_60px_rgba(83,60,27,0.06)] transition hover:-translate-y-1 hover:border-[#cfb07a] hover:shadow-[0_28px_80px_rgba(83,60,27,0.12)]"
              >
                <div className="relative overflow-hidden rounded-[1.4rem] bg-[linear-gradient(135deg,_#2f1f12,_#6b4b1f_40%,_#e3c487)]">
                  <img
                    src={guest.avatar || FALLBACK_AVATAR}
                    alt={guest.name || "嘉宾头像"}
                    className="h-56 w-full object-cover transition duration-700 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.src = FALLBACK_AVATAR;
                    }}
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#7f5f34]">
                    Guest Archive
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-baseline gap-3 whitespace-nowrap">
                    <h2 className="min-w-0 truncate text-2xl leading-none font-black tracking-tight text-[#24180a]">{guest.name || "未命名嘉宾"}</h2>
                    <span className="shrink-0 text-xs leading-none font-black uppercase tracking-[0.22em] text-[#a06f1f]">{guest.title || "节目嘉宾"}</span>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#6f665d]">{guest.bio || "暂无简介，后续可在后台补充嘉宾公开资料与人物介绍。"}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#eadbc8] bg-[#fbf6ef] px-3 py-1 text-[11px] font-bold text-[#7d6c57]">
                    关联节目 {guest.programCount || 0}
                  </span>
                  <span className="rounded-full border border-[#eadbc8] bg-[#fbf6ef] px-3 py-1 text-[11px] font-bold text-[#7d6c57]">
                    公开资料 {guest.referenceCount || 0}
                  </span>
                </div>
              </Link>
            ))
          )}
        </section>
      </main>
    </div>
  );
};

export default ExpertsPage;
