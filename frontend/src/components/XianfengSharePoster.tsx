import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";

export const SHARE_POSTER_WIDTH = 1023;
export const SHARE_POSTER_HEIGHT = 1408;
const MAX_CORE_MODULES = 12;
const BASE_CORE_ROWS = 4;
const CORE_SECTION_ROW_GROWTH = 146;
const TEMPLATE_IMAGE_URL = "/assets/share-topic-reference.png";
const HERO_BOY_IMAGE_URL = "/assets/topic-share-illustration.png";

type PosterIconKey =
  | "target"
  | "alert"
  | "box"
  | "shield"
  | "chart"
  | "clipboard"
  | "flask"
  | "trophy";

export type XianfengSharePosterItem = {
  title: string;
  desc: string;
  icon: PosterIconKey;
};

export type XianfengSharePosterData = {
  brand: string;
  title: string;
  subtitle: string;
  tags: string[];
  summaryTitle: string;
  summary: string;
  sectionTitle: string;
  sectionDesc: string;
  items: XianfengSharePosterItem[];
  ctaTitle: string;
  ctaDesc: string;
  url: string;
  footerLeft: string;
  footerRight: string;
};

type Props = {
  data: XianfengSharePosterData;
  className?: string;
  debugAdjust?: {
    textScale?: number;
    layoutDy?: Partial<Record<"summary" | "section" | "cta" | "footer", number>>;
    sectionAdjust?: Partial<Record<"timelineLineTop" | "timelineDotsTop" | "cardsLeft", number>>;
  };
};

export const getSharePosterHeight = (data: Pick<XianfengSharePosterData, "title" | "items">) => {
  const itemCount = Math.min(MAX_CORE_MODULES, Math.max(0, data.items?.length || 0));
  const coreRows = Math.max(1, Math.ceil(itemCount / 2));
  const extraCoreRows = Math.max(0, coreRows - BASE_CORE_ROWS);
  const titleLen = (data.title || "").replace(/\s+/g, "").length;
  const headerGrow = titleLen >= 16 ? 92 : titleLen >= 13 ? 52 : 0;
  return SHARE_POSTER_HEIGHT + headerGrow + extraCoreRows * CORE_SECTION_ROW_GROWTH;
};

const CARD_ICON_SIZE = 69;
const cardIconTheme: Record<PosterIconKey, { bg: string; stroke: string }> = {
  target: { bg: "#f1eaff", stroke: "#6f3df1" },
  alert: { bg: "#fdf4df", stroke: "#f5a623" },
  box: { bg: "#e9f1ff", stroke: "#4f7df5" },
  shield: { bg: "#fde8ee", stroke: "#e85b8b" },
  chart: { bg: "#e6fbf8", stroke: "#23b9aa" },
  clipboard: { bg: "#f2ecff", stroke: "#7a4df3" },
  flask: { bg: "#eef0ff", stroke: "#6f80f8" },
  trophy: { bg: "#fdf4df", stroke: "#f5a623" },
};
const sliceConfig = {
  heroTopRight: { x: 616, y: 14, w: 376, h: 356 },
  timelineLine: { x: 48, y: 620, w: 2, h: 772 },
  timelineDotsY: [581, 744, 907, 1070],
  ctaLeftIllustration: { x: 68, y: 1179, w: 175, h: 181 },
} as const;

const layoutConfig = {
  header: { x: 24, y: 24, w: 975, h: 305 },
  summary: { x: 24, y: 350, w: 975, h: 182 },
  section: { x: 24, y: 557, w: 975, h: 618 },
  cta: { x: 24, y: 1190, w: 975, h: 200 },
  footer: { x: 24, y: 1408, w: 975, h: 103, topPadding: 18 },
} as const;

const textConfig = {
  brand: 22,
  title: 62,
  subtitle: 20,
  tag: 15,
  summaryTitle: 28,
  summaryBody: 18,
  sectionTitle: 31,
  sectionDesc: 20,
  cardTitle: 23.5,
  cardBody: 15.2,
  cardLink: 15.8,
  ctaTitle: 30,
  ctaDesc: 18,
  ctaButton: 15,
  footer: 16,
} as const;

const spacingConfig = {
  headerTitleTop: 18,
  headerSubtitleTop: 10,
  headerTagsTop: 16,
  summaryBodyTop: 20,
  sectionHeadBottom: 20,
  cardBodyTop: 6,
  cardLinkTop: 10,
  ctaDescTop: 8,
  ctaBadgesTop: 14,
  qrButtonTop: 10,
} as const;

const lineHeightConfig = {
  title: 1.04,
  subtitle: 1.24,
  summaryBody: 1.52,
  sectionDesc: 1.0,
  cardTitle: 1.06,
  cardBody: 1.38,
  ctaDesc: 1.15,
  footer: 1.0,
} as const;

const sectionLayoutConfig = {
  timelineLineLeft: 28,
  timelineLineTop: 75,
  timelineDotsLeft: 0,
  timelineDotsTop: 111,
  timelineDotsHeight: 772,
  cardsLeft: 0,
  cardsGap: 20,
} as const;

const finalTuning = {
  textScale: 1.0000,
  layoutDy: { summary: 0, section: 0, cta: 0, footer: 0 },
  sectionAdjust: { timelineLineTop: 0, timelineDotsTop: 0, cardsLeft: 0 },
} as const;

function TemplateSlice({
  className,
  style,
  x,
  y,
}: {
  className?: string;
  style?: React.CSSProperties;
  x: number;
  y: number;
}) {
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundImage: `url('${TEMPLATE_IMAGE_URL}')`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${SHARE_POSTER_WIDTH}px ${SHARE_POSTER_HEIGHT}px`,
        backgroundPosition: `${-x}px ${-y}px`,
      }}
    />
  );
}

function CardIcon({ icon, size }: { icon: PosterIconKey; size: number }) {
  const t = cardIconTheme[icon];
  const stroke = t.stroke;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: t.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 48 48" fill="none" stroke={stroke} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {icon === "target" && (
          <>
            <circle cx="22" cy="26" r="14" />
            <circle cx="22" cy="26" r="7" />
            <path d="M30 18L40 8" />
            <path d="M31 8h9v9" />
            <circle cx="22" cy="26" r="1.8" fill={stroke} stroke="none" />
          </>
        )}
        {icon === "alert" && (
          <>
            <path d="M24 6L44 40H4L24 6Z" />
            <path d="M24 18V28" />
            <circle cx="24" cy="35" r="1.8" fill={stroke} stroke="none" />
          </>
        )}
        {icon === "box" && (
          <>
            <path d="M24 5L38 13V35L24 43L10 35V13L24 5Z" />
            <path d="M10 13L24 21L38 13" />
            <path d="M24 21V43" />
          </>
        )}
        {icon === "shield" && (
          <>
            <path d="M24 5L38 11V22C38 31 32 38 24 42C16 38 10 31 10 22V11L24 5Z" />
            <path d="M24 15L20 24H26L22 33" />
          </>
        )}
        {icon === "chart" && (
          <>
            <path d="M7 39H41" />
            <path d="M14 33V24" />
            <path d="M24 33V18" />
            <path d="M34 33V12" />
            <path d="M12 17L20 12L27 16L37 8" />
          </>
        )}
        {icon === "clipboard" && (
          <>
            <rect x="12" y="10" width="24" height="30" rx="4" />
            <rect x="18" y="6" width="12" height="8" rx="3" />
            <path d="M18 22H30" />
            <path d="M18 29H30" />
          </>
        )}
        {icon === "flask" && (
          <>
            <path d="M20 6H28" />
            <path d="M22 6V18L10 36C9 39 11 42 14 42H34C37 42 39 39 38 36L26 18V6" />
            <path d="M16 28H32" />
          </>
        )}
        {icon === "trophy" && (
          <>
            <path d="M16 8H32V16C32 23 28 27 24 27C20 27 16 23 16 16V8Z" />
            <path d="M16 11H10C10 17 12 20 16 21" />
            <path d="M32 11H38C38 17 36 20 32 21" />
            <path d="M24 27V35" />
            <path d="M18 40H30" />
          </>
        )}
      </svg>
    </div>
  );
}

function CtaLeftIllustration({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        background: "linear-gradient(160deg,#f6f2ff 0%,#ebe4ff 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 14,
          width: 112,
          height: 16,
          borderRadius: 8,
          background: "rgba(255,255,255,.72)",
        }}
      />
      <svg
        width={Math.round(width * 0.8)}
        height={Math.round(height * 0.8)}
        viewBox="0 0 160 140"
        style={{ position: "absolute", left: 6, bottom: -2 }}
      >
        <defs>
          <linearGradient id="xf_lens" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b39bff" />
            <stop offset="100%" stopColor="#7d59f6" />
          </linearGradient>
          <linearGradient id="xf_handle" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6a4fe8" />
            <stop offset="100%" stopColor="#4f37bf" />
          </linearGradient>
        </defs>
        <path d="M14 112L78 82L144 112L80 132Z" fill="#8b71f5" opacity="0.55" />
        <path d="M34 92L66 72C70 69 75 70 78 73L86 81L49 102C45 104 40 104 36 101L32 98C30 96 31 93 34 92Z" fill="url(#xf_handle)" />
        <circle cx="94" cy="74" r="31" fill="none" stroke="url(#xf_lens)" strokeWidth="10" />
        <circle cx="94" cy="74" r="21" fill="none" stroke="#c8b8ff" strokeWidth="5" opacity="0.8" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 62,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#8f74fb",
          boxShadow: "0 0 0 3px rgba(143,116,251,.18)",
        }}
      />
    </div>
  );
}

function TinyBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg,#f5f2ff 0%,#efe8ff 100%)",
      }}
    >
      <span
        style={{
          width: Math.max(2, Math.round(size * 0.18)),
          height: Math.round(size * 0.7),
          borderRadius: 2,
          background: "linear-gradient(180deg,#7e53ff 0%,#b89bff 100%)",
        }}
      />
    </span>
  );
}

function TinyTagIcon({ index }: { index: number }) {
  const body = [
    <path key="a" d="M6 16L9 13L12 15L18 8" />,
    <>
      <path key="b1" d="M8 8H16" />
      <path key="b2" d="M8 12H16" />
      <path key="b3" d="M8 16H13" />
    </>,
    <path key="c" d="M10 8L15 12L10 16M7 12H15" />,
  ][index % 3];

  return (
    <span style={{ width: 18, height: 18, borderRadius: 6, background: "rgba(111,61,241,.12)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6f3df1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {body}
      </svg>
    </span>
  );
}

function TinySectionIcon({ size = 25 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 6, background: "#f6f3ff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: 3, height: Math.round(size * 0.56), borderRadius: 2, background: "linear-gradient(180deg,#6f3df1 0%,#b498ff 100%)" }} />
    </span>
  );
}

function TinyBadgeIcon({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b5cf5" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="12" r="1.6" fill="#7b5cf5" stroke="none" />
        <circle cx="17" cy="8" r="1.6" fill="#7b5cf5" stroke="none" />
        <circle cx="17" cy="16" r="1.6" fill="#7b5cf5" stroke="none" />
        <path d="M9 12H13" />
        <path d="M14.5 12H18.5" />
        <path d="M17 10V14" />
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b5cf5" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18L10 12L14 15L20 8" />
        <path d="M17 8H20V11" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b5cf5" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5V12L16 14" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export const XianfengSharePoster: React.FC<Props> = ({ data, className, debugAdjust }) => {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const tags = useMemo(() => data.tags.slice(0, 3), [data.tags]);
  const items = useMemo(() => data.items.slice(0, MAX_CORE_MODULES), [data.items]);
  const coreRows = Math.max(1, Math.ceil(items.length / 2));
  const extraCoreRows = Math.max(0, coreRows - BASE_CORE_ROWS);
  const coreSectionGrow = extraCoreRows * CORE_SECTION_ROW_GROWTH;
  const compactHeader = useMemo(() => {
    const titleLen = (data.title || "").replace(/\s+/g, "").length;
    const subtitleLen = (data.subtitle || "").replace(/\s+/g, "").length;
    return titleLen >= 9 || subtitleLen >= 12;
  }, [data.title, data.subtitle]);
  // 仅在更可能出现两行标题时撑开头部，避免单行标题出现过多留白
  const headerGrow = useMemo(() => {
    const titleLen = (data.title || "").replace(/\s+/g, "").length;
    if (titleLen >= 16) return 92;
    if (titleLen >= 13) return 52;
    return 0;
  }, [data.title]);
  const flowOffset = headerGrow;
  const posterHeight = getSharePosterHeight(data);
  const textScale = (finalTuning.textScale ?? 1) * (debugAdjust?.textScale ?? 1);
  const layoutDy = {
    summary: (finalTuning.layoutDy.summary ?? 0) + (debugAdjust?.layoutDy?.summary ?? 0),
    section: (finalTuning.layoutDy.section ?? 0) + (debugAdjust?.layoutDy?.section ?? 0),
    cta: (finalTuning.layoutDy.cta ?? 0) + (debugAdjust?.layoutDy?.cta ?? 0),
    footer: (finalTuning.layoutDy.footer ?? 0) + (debugAdjust?.layoutDy?.footer ?? 0),
  };
  const sectionAdjust = {
    timelineLineTop:
      (finalTuning.sectionAdjust.timelineLineTop ?? 0) + (debugAdjust?.sectionAdjust?.timelineLineTop ?? 0),
    timelineDotsTop:
      (finalTuning.sectionAdjust.timelineDotsTop ?? 0) + (debugAdjust?.sectionAdjust?.timelineDotsTop ?? 0),
    cardsLeft: (finalTuning.sectionAdjust.cardsLeft ?? 0) + (debugAdjust?.sectionAdjust?.cardsLeft ?? 0),
  };
  const scaled = (v: number) => v * textScale;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(data.url, {
      width: 160,
      margin: 1,
      color: { dark: "#111036", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [data.url]);

  return (
    <div
      className={`relative overflow-hidden rounded-[30px] border border-[#cfc0ee] bg-gradient-to-b from-[#f8f5ff] via-[#f7f4ff] to-[#f2edff] ${className || ""}`}
      style={{
        width: SHARE_POSTER_WIDTH,
        height: posterHeight,
        textAlign: "left",
        fontFamily:
          '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
      }}
    >
      <div className="relative h-full">
        <section
          className="absolute overflow-hidden rounded-[24px] bg-gradient-to-r from-[#f7f2ff] to-[#efe7ff] p-8 pb-7"
          style={{
            left: layoutConfig.header.x,
            top: layoutConfig.header.y,
            width: layoutConfig.header.w,
            height: layoutConfig.header.h + headerGrow,
          }}
        >
            <div className="inline-flex items-center">
              <img
                src="/assets/logo.png"
                alt="家长先疯"
                style={{ height: 44, width: "auto", display: "block" }}
              />
            </div>
            <div className="max-w-[580px]" style={{ marginTop: spacingConfig.headerTitleTop }}>
              <h1
                className="text-[56px] font-extrabold tracking-[-0.02em] text-[#1c1660]"
                style={{
                  fontSize: scaled(compactHeader ? textConfig.title * 0.92 : textConfig.title),
                  lineHeight: compactHeader ? 0.98 : lineHeightConfig.title,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {data.title}
              </h1>
              <p
                className="text-[24px] font-medium text-[#6f4fe9]"
                style={{
                  marginTop: (compactHeader ? 8 : 14) + 16,
                  fontSize: scaled(compactHeader ? textConfig.subtitle * 0.93 : textConfig.subtitle),
                  lineHeight: compactHeader ? 1.15 : lineHeightConfig.subtitle,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {data.subtitle}
              </p>
              <div className="flex gap-3" style={{ marginTop: compactHeader ? 12 : spacingConfig.headerTagsTop }}>
                {tags.map((tag, idx) => {
                  return (
                  <span
                    key={`${tag}-${idx}`}
                    className="inline-flex h-[38px] min-w-0 flex-1 items-center rounded-[12px] border border-[#dccdf9] bg-white/40 px-3.5 text-[14px] font-semibold leading-none text-[#6e4de7]"
                    title={tag}
                  >
                    <span className="mr-2 inline-flex items-center justify-center">
                      <TinyTagIcon index={idx} />
                    </span>
                    <span className="line-clamp-1 text-[14px]" style={{ fontSize: scaled(textConfig.tag) }}>{tag}</span>
                  </span>
                  );
                })}
              </div>
            </div>
            <div
              className="pointer-events-none absolute right-0 top-0 overflow-hidden"
              style={{
                width: sliceConfig.heroTopRight.w,
                height: sliceConfig.heroTopRight.h,
              }}
            >
              <img
                src={HERO_BOY_IMAGE_URL}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  display: "block",
                }}
              />
            </div>
        </section>

        <section
          className="absolute overflow-hidden rounded-[20px] border border-[#e5dbfb] bg-white/90 p-0"
          style={{
            left: layoutConfig.summary.x,
            top: layoutConfig.summary.y + (layoutDy.summary || 0) + flowOffset,
            width: layoutConfig.summary.w,
            height: layoutConfig.summary.h,
          }}
        >
          <div className="relative h-full p-8 pl-9 pr-9">
              <span className="absolute left-0 top-[22px] h-[136px] w-[8px] rounded-r-full bg-gradient-to-b from-[#7e4fff] to-[#b599ff]" />
              <h3 className="flex items-center gap-2 text-[22px] font-extrabold leading-none text-[#2a1869]" style={{ fontSize: scaled(textConfig.summaryTitle) }}>
                <TinySectionIcon size={25} />
                <span>{data.summaryTitle}</span>
              </h3>
              <p className="line-clamp-4 text-[14px] text-[#4f4574]" style={{ marginTop: spacingConfig.summaryBodyTop, fontSize: scaled(textConfig.summaryBody), lineHeight: lineHeightConfig.summaryBody }}>{data.summary}</p>
          </div>
        </section>

        <section
          className="absolute overflow-hidden"
          style={{
            left: layoutConfig.section.x,
            top: layoutConfig.section.y + (layoutDy.section || 0) + flowOffset,
            width: layoutConfig.section.w,
            height: layoutConfig.section.h + coreSectionGrow,
          }}
        >
            <div className="flex items-end gap-4" style={{ marginBottom: spacingConfig.sectionHeadBottom }}>
              <h3 className="flex items-center gap-2 text-[22px] font-black leading-none text-[#251560]" style={{ fontSize: scaled(textConfig.sectionTitle) }}>
                <TinySectionIcon size={29} />
                <span>{data.sectionTitle}</span>
              </h3>
              <p className="pb-1 text-[14px] font-medium text-[#73649e]" style={{ fontSize: scaled(textConfig.sectionDesc), lineHeight: lineHeightConfig.sectionDesc }}>{data.sectionDesc}</p>
            </div>

            <div
              className="grid grid-cols-2"
              style={{ marginLeft: sectionLayoutConfig.cardsLeft + (sectionAdjust.cardsLeft || 0), gap: sectionLayoutConfig.cardsGap }}
            >
              {items.map((item, idx) => (
                <article
                  key={`${item.title}-${idx}`}
                  className="rounded-[20px] border border-[#e8e1f9] bg-white px-5 py-[22px] shadow-[0_4px_12px_rgba(104,85,170,0.06)]"
                >
                  <div className="flex gap-4">
                    <div
                      className="flex shrink-0 items-center justify-center"
                      style={{ width: CARD_ICON_SIZE, height: CARD_ICON_SIZE }}
                    >
                      <CardIcon icon={item.icon} size={CARD_ICON_SIZE} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="line-clamp-1 text-[16px] font-black tracking-[-0.01em] text-[#1e1549]" style={{ fontSize: scaled(textConfig.cardTitle), lineHeight: lineHeightConfig.cardTitle }}>{item.title}</h4>
                      <p className="line-clamp-2 text-[12px] text-[#5f587f]" style={{ marginTop: spacingConfig.cardBodyTop, fontSize: scaled(textConfig.cardBody), lineHeight: lineHeightConfig.cardBody }}>{item.desc}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
        </section>

        <section
          className="absolute overflow-hidden rounded-[20px] border border-[#ddd2f7] bg-gradient-to-r from-[#efe8ff] to-[#ece5ff] p-4"
          style={{
            left: layoutConfig.cta.x,
            top: layoutConfig.cta.y + (layoutDy.cta || 0) + flowOffset + coreSectionGrow,
            width: layoutConfig.cta.w,
            height: layoutConfig.cta.h,
          }}
        >
            <div className="flex items-center gap-5">
              <div className="shrink-0">
                <CtaLeftIllustration width={sliceConfig.ctaLeftIllustration.w} height={sliceConfig.ctaLeftIllustration.h} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[22px] font-black leading-none text-[#1f1760]" style={{ fontSize: scaled(textConfig.ctaTitle) }}>{data.ctaTitle}</h3>
                <p className="text-[14px] font-medium text-[#655a8b]" style={{ marginTop: spacingConfig.ctaDescTop, fontSize: scaled(textConfig.ctaDesc), lineHeight: lineHeightConfig.ctaDesc }}>{data.ctaDesc}</p>
                <div className="flex gap-2.5" style={{ marginTop: spacingConfig.ctaBadgesTop }}>
                  <span className="inline-flex min-h-[64px] min-w-[140px] items-center gap-2 rounded-[12px] border border-[#d9cdf8] bg-white px-3 py-2 text-[#6a4fe8]">
                    <TinyBadgeIcon index={0} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[14px] font-bold leading-none">100+ 专题</span>
                      <span className="mt-1 text-[10px] font-medium text-[#8a7cbc]">系统化知识地图</span>
                    </span>
                  </span>
                  <span className="inline-flex min-h-[64px] min-w-[140px] items-center gap-2 rounded-[12px] border border-[#d9cdf8] bg-white px-3 py-2 text-[#6a4fe8]">
                    <TinyBadgeIcon index={1} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[14px] font-bold leading-none">学习路径</span>
                      <span className="mt-1 text-[10px] font-medium text-[#8a7cbc]">可视化学习路径</span>
                    </span>
                  </span>
                  <span className="inline-flex min-h-[64px] min-w-[140px] items-center gap-2 rounded-[12px] border border-[#d9cdf8] bg-white px-3 py-2 text-[#6a4fe8]">
                    <TinyBadgeIcon index={2} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[14px] font-bold leading-none">持续更新</span>
                      <span className="mt-1 text-[10px] font-medium text-[#8a7cbc]">高质量内容持续更新</span>
                    </span>
                  </span>
                </div>
              </div>
              <div className="w-[176px] shrink-0">
                <div className="rounded-[16px] bg-white p-2.5 shadow-[0_6px_14px_rgba(88,68,145,0.14)]">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR" className="h-[156px] w-[156px] rounded-[8px]" />
                  ) : (
                    <div className="flex h-[156px] w-[156px] items-center justify-center rounded-[8px] bg-[#f3efff] text-[16px] font-bold text-[#907bd1]">二维码</div>
                  )}
                </div>
                <div className="py-2 text-center text-[12px] font-extrabold tracking-[0.01em] text-white" style={{ marginTop: spacingConfig.qrButtonTop, fontSize: scaled(textConfig.ctaButton) }}>
                  长按扫码进入
                </div>
              </div>
            </div>
        </section>

        
      </div>
    </div>
  );
};

export const posterData: XianfengSharePosterData = {
  brand: "家长先疯 · 先疯智库",
  title: "如何培养孩子的自信心",
  subtitle: "从“我不行”到“我可以”的内在力量建设",
  tags: ["适合 3-12 岁家长", "儿童心理", "自信心培养"],
  summaryTitle: "知识总览",
  summary:
    "自信心是对自身价值的肯定，需要长期培养。本文从8个核心维度，系统讲解如何科学培养孩子的自信心。",
  sectionTitle: "核心知识点",
  sectionDesc: "完整知识树 · 12大核心模块",
  items: [
    { title: "核心概念", desc: "理解如何培养孩子自信心的本质与关键定义", icon: "target" },
    { title: "常见误区", desc: "关于如何培养孩子自信心最常见的3个误解", icon: "alert" },
    { title: "理论框架", desc: "支撑自信心培养的学术理论与模型", icon: "box" },
    { title: "风险信号", desc: "识别孩子自信心问题的早期预警信号", icon: "shield" },
    { title: "评估工具", desc: "科学评估孩子自信心水平的工具与方法", icon: "chart" },
    { title: "自查清单", desc: "家长自测孩子自信心状况的快速清单", icon: "clipboard" },
    { title: "科学方法", desc: "解决孩子自信心问题的系统方法论", icon: "flask" },
    { title: "成功案例", desc: "改善孩子自信心的真实案例分享", icon: "trophy" },
    { title: "家庭协同", desc: "家庭成员协同支持孩子稳定成长", icon: "target" },
    { title: "实践路径", desc: "从认知到行动的阶段化落地路径", icon: "alert" },
    { title: "追踪复盘", desc: "通过记录与复盘持续优化教育策略", icon: "box" },
    { title: "长期机制", desc: "建立可持续的家庭教育支持机制", icon: "shield" },
  ],
  ctaTitle: "扫码查看完整知识树",
  ctaDesc: "打开家长先疯，了解更多教育话题",
  url: "https://xianfeng.xinzhi.info",
  footerLeft: "xianfeng.xinzhi.info",
  footerRight: "家长先疯 · 先疯智库出品",
};

export const XianfengSharePosterExample: React.FC = () => (
  <SharePosterPreviewWithOverlay />
);

const SharePosterPreviewWithOverlay: React.FC = () => {
  const [opacity, setOpacity] = useState(0.35);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayMode, setOverlayMode] = useState<"normal" | "difference">("normal");
  const [textScale, setTextScale] = useState(1);
  const [summaryDy, setSummaryDy] = useState(0);
  const [sectionDy, setSectionDy] = useState(0);
  const [ctaDy, setCtaDy] = useState(0);
  const [footerDy, setFooterDy] = useState(0);
  const [lineTopDy, setLineTopDy] = useState(0);
  const [dotsTopDy, setDotsTopDy] = useState(0);
  const [cardsLeftDx, setCardsLeftDx] = useState(0);
  const [copyMsg, setCopyMsg] = useState("");
  const [importText, setImportText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [diffStats, setDiffStats] = useState<{
    changedPercent: number;
    meanAbsChannelDiff: number;
    changedPixels: number;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const num = (k: string, fallback: number) => {
      const v = Number(params.get(k));
      return Number.isFinite(v) ? v : fallback;
    };
    const ts = num("ts", 1);
    setTextScale(ts > 0 ? ts : 1);
    setSummaryDy(num("sy", 0));
    setSectionDy(num("ky", 0));
    setCtaDy(num("cy", 0));
    setFooterDy(num("fy", 0));
    setLineTopDy(num("ly", 0));
    setDotsTopDy(num("dy", 0));
    setCardsLeftDx(num("cx", 0));
    const mode = params.get("mode");
    if (mode === "difference" || mode === "normal") setOverlayMode(mode);
    const alpha = num("op", 35) / 100;
    if (alpha >= 0 && alpha <= 1) setOpacity(alpha);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("ts", String(textScale));
    params.set("sy", String(summaryDy));
    params.set("ky", String(sectionDy));
    params.set("cy", String(ctaDy));
    params.set("fy", String(footerDy));
    params.set("ly", String(lineTopDy));
    params.set("dy", String(dotsTopDy));
    params.set("cx", String(cardsLeftDx));
    params.set("mode", overlayMode);
    params.set("op", String(Math.round(opacity * 100)));
    const qs = params.toString();
    const next = `${window.location.pathname}?${qs}`;
    window.history.replaceState(null, "", next);
  }, [textScale, summaryDy, sectionDy, ctaDy, footerDy, lineTopDy, dotsTopDy, cardsLeftDx, overlayMode, opacity]);

  const tunedConfigText = useMemo(() => {
    const tuned = {
      textScale,
      layoutDy: { summary: summaryDy, section: sectionDy, cta: ctaDy, footer: footerDy },
      sectionAdjust: { timelineLineTop: lineTopDy, timelineDotsTop: dotsTopDy, cardsLeft: cardsLeftDx },
      resolvedLayout: {
        summaryY: layoutConfig.summary.y + summaryDy,
        sectionY: layoutConfig.section.y + sectionDy,
        ctaY: layoutConfig.cta.y + ctaDy,
        footerY: layoutConfig.footer.y + footerDy,
      },
    };
    return JSON.stringify(tuned, null, 2);
  }, [textScale, summaryDy, sectionDy, ctaDy, footerDy, lineTopDy, dotsTopDy, cardsLeftDx]);

  const tunedTsText = useMemo(() => {
    const r = {
      summaryY: layoutConfig.summary.y + summaryDy,
      sectionY: layoutConfig.section.y + sectionDy,
      ctaY: layoutConfig.cta.y + ctaDy,
      footerY: layoutConfig.footer.y + footerDy,
      timelineLineTop: sectionLayoutConfig.timelineLineTop + lineTopDy,
      timelineDotsTop: sectionLayoutConfig.timelineDotsTop + dotsTopDy,
      cardsLeft: sectionLayoutConfig.cardsLeft + cardsLeftDx,
    };
    return [
      "const finalTuning = {",
      `  textScale: ${textScale},`,
      "  layout: {",
      `    summaryY: ${r.summaryY},`,
      `    sectionY: ${r.sectionY},`,
      `    ctaY: ${r.ctaY},`,
      `    footerY: ${r.footerY},`,
      "  },",
      "  section: {",
      `    timelineLineTop: ${r.timelineLineTop},`,
      `    timelineDotsTop: ${r.timelineDotsTop},`,
      `    cardsLeft: ${r.cardsLeft},`,
      "  },",
      "} as const;",
    ].join("\n");
  }, [textScale, summaryDy, sectionDy, ctaDy, footerDy, lineTopDy, dotsTopDy, cardsLeftDx]);

  const finalTuningSnippet = useMemo(() => {
    const mergedTextScale = (finalTuning.textScale ?? 1) * textScale;
    const merged = {
      summary: (finalTuning.layoutDy.summary ?? 0) + summaryDy,
      section: (finalTuning.layoutDy.section ?? 0) + sectionDy,
      cta: (finalTuning.layoutDy.cta ?? 0) + ctaDy,
      footer: (finalTuning.layoutDy.footer ?? 0) + footerDy,
      timelineLineTop: (finalTuning.sectionAdjust.timelineLineTop ?? 0) + lineTopDy,
      timelineDotsTop: (finalTuning.sectionAdjust.timelineDotsTop ?? 0) + dotsTopDy,
      cardsLeft: (finalTuning.sectionAdjust.cardsLeft ?? 0) + cardsLeftDx,
    };
    return [
      "const finalTuning = {",
      `  textScale: ${mergedTextScale.toFixed(4)},`,
      "  layoutDy: {",
      `    summary: ${merged.summary},`,
      `    section: ${merged.section},`,
      `    cta: ${merged.cta},`,
      `    footer: ${merged.footer},`,
      "  },",
      "  sectionAdjust: {",
      `    timelineLineTop: ${merged.timelineLineTop},`,
      `    timelineDotsTop: ${merged.timelineDotsTop},`,
      `    cardsLeft: ${merged.cardsLeft},`,
      "  },",
      "} as const;",
    ].join("\n");
  }, [textScale, summaryDy, sectionDy, ctaDy, footerDy, lineTopDy, dotsTopDy, cardsLeftDx]);

  return (
    <div className="min-h-screen bg-[#f2ecff] p-6">
      <div className="mb-4 flex items-center gap-4 text-sm text-[#3b2d74]">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => setShowOverlay(e.target.checked)}
          />
          显示参考叠加
        </label>
        <label className="inline-flex items-center gap-2">
          透明度
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
          />
          <span>{Math.round(opacity * 100)}%</span>
        </label>
        <label className="inline-flex items-center gap-2">
          对照模式
          <select
            value={overlayMode}
            onChange={(e) => setOverlayMode(e.target.value as "normal" | "difference")}
            className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs"
          >
            <option value="normal">normal</option>
            <option value="difference">difference</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          字号缩放
          <input type="range" min={90} max={110} value={Math.round(textScale * 100)} onChange={(e) => setTextScale(Number(e.target.value) / 100)} />
          <span>{Math.round(textScale * 100)}%</span>
        </label>
        <label className="inline-flex items-center gap-2">
          S
          <input type="range" min={-12} max={12} value={summaryDy} onChange={(e) => setSummaryDy(Number(e.target.value))} />
          <span>{summaryDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          K
          <input type="range" min={-12} max={12} value={sectionDy} onChange={(e) => setSectionDy(Number(e.target.value))} />
          <span>{sectionDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          C
          <input type="range" min={-12} max={12} value={ctaDy} onChange={(e) => setCtaDy(Number(e.target.value))} />
          <span>{ctaDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          F
          <input type="range" min={-12} max={12} value={footerDy} onChange={(e) => setFooterDy(Number(e.target.value))} />
          <span>{footerDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          L
          <input type="range" min={-12} max={12} value={lineTopDy} onChange={(e) => setLineTopDy(Number(e.target.value))} />
          <span>{lineTopDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          D
          <input type="range" min={-12} max={12} value={dotsTopDy} onChange={(e) => setDotsTopDy(Number(e.target.value))} />
          <span>{dotsTopDy}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          X
          <input type="range" min={-20} max={20} value={cardsLeftDx} onChange={(e) => setCardsLeftDx(Number(e.target.value))} />
          <span>{cardsLeftDx}</span>
        </label>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(tunedConfigText);
              setCopyMsg("已复制调参结果");
              setTimeout(() => setCopyMsg(""), 1500);
            } catch {
              setCopyMsg("复制失败");
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1]"
        >
          复制调参结果
        </button>
        <span className="text-xs text-[#7a68b8]">{copyMsg}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopyMsg("已复制调参链接");
              setTimeout(() => setCopyMsg(""), 1500);
            } catch {
              setCopyMsg("复制链接失败");
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1]"
        >
          复制调参链接
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(tunedTsText);
              setCopyMsg("已复制固化代码");
              setTimeout(() => setCopyMsg(""), 1500);
            } catch {
              setCopyMsg("复制固化代码失败");
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1]"
        >
          复制固化代码
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(finalTuningSnippet);
              setCopyMsg("已复制 finalTuning 片段");
              setTimeout(() => setCopyMsg(""), 1500);
            } catch {
              setCopyMsg("复制 finalTuning 片段失败");
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1]"
        >
          复制finalTuning
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              setExporting(true);
              const node = document.getElementById("share-preview-canvas");
              if (!node) throw new Error("preview node missing");
              const dataUrl = await toPng(node, {
                cacheBust: true,
                pixelRatio: 1,
                width: SHARE_POSTER_WIDTH,
                height: SHARE_POSTER_HEIGHT,
              });
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = "share-current.png";
              a.click();
              setCopyMsg("已导出 share-current.png");
            } catch {
              setCopyMsg("导出失败");
            } finally {
              setExporting(false);
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          disabled={exporting}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1] disabled:opacity-60"
        >
          {exporting ? "导出中..." : "导出当前图"}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const node = document.getElementById("share-preview-canvas");
              if (!node) throw new Error("preview node missing");
              const dataUrl = await toPng(node, {
                cacheBust: true,
                pixelRatio: 1,
                width: SHARE_POSTER_WIDTH,
                height: SHARE_POSTER_HEIGHT,
              });

              const loadImage = (src: string) =>
                new Promise<HTMLImageElement>((resolve, reject) => {
                  const img = new Image();
                  img.onload = () => resolve(img);
                  img.onerror = reject;
                  img.src = src;
                });

              const [actualImg, expectedImg] = await Promise.all([
                loadImage(dataUrl),
                loadImage(TEMPLATE_IMAGE_URL),
              ]);

              const canvas = document.createElement("canvas");
              canvas.width = SHARE_POSTER_WIDTH;
              canvas.height = SHARE_POSTER_HEIGHT;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("canvas context missing");

              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(actualImg, 0, 0, canvas.width, canvas.height);
              const actualData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(expectedImg, 0, 0, canvas.width, canvas.height);
              const expectedData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

              const totalPixels = canvas.width * canvas.height;
              const threshold = 16;
              let changed = 0;
              let sum = 0;

              for (let i = 0; i < actualData.length; i += 4) {
                const dr = Math.abs(actualData[i] - expectedData[i]);
                const dg = Math.abs(actualData[i + 1] - expectedData[i + 1]);
                const db = Math.abs(actualData[i + 2] - expectedData[i + 2]);
                const da = Math.abs(actualData[i + 3] - expectedData[i + 3]);
                sum += dr + dg + db + da;
                if (dr > threshold || dg > threshold || db > threshold || da > threshold) changed += 1;
              }

              setDiffStats({
                changedPixels: changed,
                changedPercent: (changed / totalPixels) * 100,
                meanAbsChannelDiff: sum / (totalPixels * 4),
              });
              setCopyMsg("已计算差异");
              setTimeout(() => setCopyMsg(""), 1200);
            } catch {
              setCopyMsg("差异计算失败");
              setTimeout(() => setCopyMsg(""), 1500);
            }
          }}
          className="rounded border border-[#cdbdf5] bg-white px-2 py-1 text-xs font-semibold text-[#4b2db1]"
        >
          计算差异
        </button>
      </div>
      {diffStats ? (
        <div className="mb-3 rounded bg-white/80 px-3 py-2 text-xs text-[#4b2db1]">
          changed: {diffStats.changedPercent.toFixed(4)}% ({diffStats.changedPixels} px) · mean:{" "}
          {diffStats.meanAbsChannelDiff.toFixed(4)}
          <span className="ml-3">
            normal:
            {diffStats.changedPercent <= 3.0 && diffStats.meanAbsChannelDiff <= 8.0 ? (
              <strong className="ml-1 text-[#0f7a35]">PASS</strong>
            ) : (
              <strong className="ml-1 text-[#b42318]">FAIL</strong>
            )}
          </span>
          <span className="ml-3">
            strict:
            {diffStats.changedPercent <= 2.0 && diffStats.meanAbsChannelDiff <= 6.0 ? (
              <strong className="ml-1 text-[#0f7a35]">PASS</strong>
            ) : (
              <strong className="ml-1 text-[#b42318]">FAIL</strong>
            )}
          </span>
          <button
            type="button"
            onClick={async () => {
              const text = `changed_percent=${diffStats.changedPercent.toFixed(6)}, mean_abs_channel_diff=${diffStats.meanAbsChannelDiff.toFixed(6)}, changed_pixels=${diffStats.changedPixels}`;
              try {
                await navigator.clipboard.writeText(text);
                setCopyMsg("已复制差异评分");
                setTimeout(() => setCopyMsg(""), 1200);
              } catch {
                setCopyMsg("复制评分失败");
                setTimeout(() => setCopyMsg(""), 1200);
              }
            }}
            className="ml-3 rounded border border-[#cdbdf5] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#4b2db1]"
          >
            复制评分
          </button>
        </div>
      ) : null}
      <pre className="mb-4 max-h-40 overflow-auto rounded bg-white/80 p-2 text-xs text-[#4b2db1]">{tunedConfigText}</pre>
      <pre className="mb-4 max-h-40 overflow-auto rounded bg-white/80 p-2 text-xs text-[#4b2db1]">{tunedTsText}</pre>
      <pre className="mb-4 max-h-40 overflow-auto rounded bg-white/80 p-2 text-xs text-[#4b2db1]">{finalTuningSnippet}</pre>
      <div className="mb-4 rounded bg-white/80 p-3 text-xs text-[#4b2db1]">
        <div className="mb-2 font-semibold">粘贴调参结果回放</div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='粘贴包含 textScale/layoutDy 的 JSON'
          className="h-24 w-full rounded border border-[#d8cdf8] p-2"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = JSON.parse(importText) as {
                  textScale?: number;
                  layoutDy?: Partial<Record<"summary" | "section" | "cta" | "footer", number>>;
                };
                if (typeof parsed.textScale === "number") setTextScale(parsed.textScale);
                if (parsed.layoutDy) {
                  setSummaryDy(parsed.layoutDy.summary || 0);
                  setSectionDy(parsed.layoutDy.section || 0);
                  setCtaDy(parsed.layoutDy.cta || 0);
                  setFooterDy(parsed.layoutDy.footer || 0);
                }
                const sectionAdj = (parsed as { sectionAdjust?: Partial<Record<"timelineLineTop" | "timelineDotsTop" | "cardsLeft", number>> }).sectionAdjust;
                if (sectionAdj) {
                  setLineTopDy(sectionAdj.timelineLineTop || 0);
                  setDotsTopDy(sectionAdj.timelineDotsTop || 0);
                  setCardsLeftDx(sectionAdj.cardsLeft || 0);
                }
                setCopyMsg("已应用粘贴参数");
                setTimeout(() => setCopyMsg(""), 1500);
              } catch {
                setCopyMsg("JSON 无效");
                setTimeout(() => setCopyMsg(""), 1500);
              }
            }}
            className="rounded border border-[#cdbdf5] bg-white px-2 py-1 font-semibold text-[#4b2db1]"
          >
            应用参数
          </button>
          <button
            type="button"
            onClick={() => {
              setTextScale(1);
              setSummaryDy(0);
              setSectionDy(0);
              setCtaDy(0);
              setFooterDy(0);
              setLineTopDy(0);
              setDotsTopDy(0);
              setCardsLeftDx(0);
              setImportText("");
            }}
            className="rounded border border-[#e1d9fb] bg-white px-2 py-1 font-semibold text-[#6a59a6]"
          >
            重置
          </button>
        </div>
      </div>

      <div
        id="share-preview-canvas"
        className="relative"
        style={{ width: SHARE_POSTER_WIDTH, height: SHARE_POSTER_HEIGHT }}
      >
        <XianfengSharePoster
          data={posterData}
          debugAdjust={{
            textScale,
            layoutDy: { summary: summaryDy, section: sectionDy, cta: ctaDy, footer: footerDy },
            sectionAdjust: { timelineLineTop: lineTopDy, timelineDotsTop: dotsTopDy, cardsLeft: cardsLeftDx },
          }}
        />
        {showOverlay ? (
          <img
            src={TEMPLATE_IMAGE_URL}
            alt="reference-overlay"
            className="pointer-events-none absolute inset-0"
            style={{
              width: SHARE_POSTER_WIDTH,
              height: SHARE_POSTER_HEIGHT,
              opacity,
              mixBlendMode: overlayMode === "difference" ? "difference" : "normal",
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default XianfengSharePoster;
