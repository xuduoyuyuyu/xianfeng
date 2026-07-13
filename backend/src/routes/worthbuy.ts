import { Router, Request, Response } from "express";
import WorthBuyAnalysis from "../models/WorthBuyAnalysis";
import { authenticate } from "../middlewares/auth";
import { requirePro } from "../middlewares/requirePro";

const router = Router();

const WORTHBUY_LIST_SELECT = [
  "brand",
  "query",
  "submittedBy",
  "status",
  "createdAt",
  "updatedAt",
  "result.score",
  "result.isIqTax",
  "result.reason",
  "result.brand",
  "result.title",
  "result.url",
  "result.priceRange",
].join(" ");

function parseWorthBuyPagination(req: Request) {
  const paged = req.query.current !== undefined || req.query.size !== undefined;
  const current = Math.max(1, Number(req.query.current) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 20));
  return { paged, current, size };
}

export const WORTHBUY_FAILURE_GUIDANCE = {
  message: "暂时没有解析到有效商品信息，请补充商品名称后再试。",
  tips: [
    "尽量提供完整商品标题，不要只粘贴失效短链或活动页链接。",
    "如果是京东/淘宝/拼多多分享，请复制电商分享文案，而不是只复制浏览器地址。",
    "如果链接打不开，请手动补充品牌、型号、品类和关键卖点。",
  ],
  examples: [
    "品牌 + 型号 + 品类：公牛 CA1507 护眼落地台灯",
    "复制电商分享文案：【京东】公牛 CA1507 护眼落地台灯 https://3.cn/...",
    "商品链接 + 商品名称：https://item.jd.com/... 公牛 Ai 智能小晴空大路灯",
  ],
};

export function buildWorthBuyResultForSave(input: { analyzeResult: any; brandName: string; url?: string | null }) {
  return {
    ...(input.analyzeResult || {}),
    brand: input.brandName,
    url: input.url || null,
  };
}

export function resolveWorthBuyUserId(req: Pick<Request, "query"> & { userId?: unknown }) {
  const authUserId = (req as any).userId;
  if (authUserId) return String(authUserId);
  const queryUserId = req.query?.userId;
  if (Array.isArray(queryUserId)) return String(queryUserId[0] || "");
  return String(queryUserId || "");
}

export function canReadWorthBuyItem(item: { status?: string; submittedBy?: string }, userId: string, isAdmin: boolean) {
  if (item.status === "deleted") return isAdmin;
  return item.status === "published" || isAdmin || Boolean(userId && item.submittedBy === userId);
}

export function isUndeliverableWorthBuyAnalysis(searchTarget: string, result: any) {
  const target = String(searchTarget || "");
  const isUrl = /^https?:\/\//i.test(target);
  const reason = String(result?.reason || result?.summary || result?.verdict || "");
  const score = Number(result?.score);
  const noProduct = /页面无有效商品信息|京东平台通用提示|无法进行分析|无法提取商品信息|无法获取商品信息|页面无法访问|活动火爆|加载失败/.test(reason);
  return isUrl && noProduct && (!Number.isFinite(score) || score <= 0);
}

function requireProForNewAnalysis(req: Request, res: Response, next: any) {
  if (req.body?.result) {
    next();
    return;
  }
  authenticate(req as any, res, () => {
    requirePro("worthbuy_analysis")(req as any, res, next);
  });
}

// GET 用户查看自己的提交列表（通过 submittedBy 或查询参数）
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = resolveWorthBuyUserId(req);
    const filter = { submittedBy: userId, status: { $ne: "deleted" } };
    const { paged, current, size } = parseWorthBuyPagination(req);
    const query = WorthBuyAnalysis.find(filter).select(WORTHBUY_LIST_SELECT).sort({ createdAt: -1 });
    if (!paged) return res.json({ items: await query.lean() });
    const [items, total] = await Promise.all([query.skip((current - 1) * size).limit(size).lean(), WorthBuyAnalysis.countDocuments(filter)]);
    res.json({ items, total, current, pages: Math.max(1, Math.ceil(total / size)), size });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE 用户删除自己的提交
router.delete("/my/:brand", async (req: Request, res: Response) => {
  try {
    const userId = resolveWorthBuyUserId(req);
    const brand = decodeURIComponent(req.params.brand as string);
    const doc = await WorthBuyAnalysis.findOneAndDelete({ brand, submittedBy: userId });
    if (!doc) return res.status(404).json({ error: "未找到该分析或无权删除" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET 公开列表（只有 status=published 的）
router.get("/list", async (req: Request, res: Response) => {
  try {
    const filter = { status: "published" };
    const { paged, current, size } = parseWorthBuyPagination(req);
    const query = WorthBuyAnalysis.find(filter).select(WORTHBUY_LIST_SELECT).sort({ createdAt: -1 });
    if (!paged) return res.json({ items: await query.lean() });
    const [items, total] = await Promise.all([query.skip((current - 1) * size).limit(size).lean(), WorthBuyAnalysis.countDocuments(filter)]);
    res.json({ items, total, current, pages: Math.max(1, Math.ceil(total / size)), size });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET 单个详情（published 或 本人的 draft）
router.get("/:brand", async (req: Request, res: Response) => {
  try {
    const brand = decodeURIComponent(String(req.params.brand));
    const item = await WorthBuyAnalysis.findOne({
      $or: [
        { brand },
        { query: brand },
        { "result.url": brand },
      ],
    }).lean();
    if (!item) return res.status(404).json({ error: "未找到该分析" });

    // 如果是 draft/hidden，只有提交者和管理员能看
    const userId = resolveWorthBuyUserId(req);
    const isAdmin = (req as any).isAdmin === true;
    if (!canReadWorthBuyItem(item, userId, isAdmin)) {
      return res.status(403).json({ error: "该分析尚未公开" });
    }

    res.json({ item });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST 提交新分析
router.post("/submit", requireProForNewAnalysis, async (req: Request, res: Response) => {
  try {
    const { brand: incomingBrand, url, query, result, submittedBy, extractedTitle } = req.body || {};

    // 如果传了 result（保存模式），保留原逻辑
    if (result) {
      const brand = incomingBrand || url || "";
      if (!brand) return res.status(400).json({ error: "brand 为必填项" });
      const effectiveUserId = submittedBy || (req as any).userId || "";
      const existing = await WorthBuyAnalysis.findOne({ brand });
      if (existing) {
        existing.result = result;
        existing.submittedBy = effectiveUserId || existing.submittedBy || "";
        await existing.save();
        return res.status(200).json({ item: existing.toObject(), updated: true });
      }
      const doc = await WorthBuyAnalysis.create({
        brand,
        query: query || brand,
        submittedBy: effectiveUserId,
        status: "draft",
        result,
      });
      return res.status(201).json({ item: doc.toObject() });
    }

    // 新分析模式：通过 url 或 brand 触发 AI 深度分析
    const searchTarget = url || incomingBrand || "";
    if (!searchTarget) return res.status(400).json({ error: "请提供商品链接(url)或品牌名称(brand)" });

    // 1. 先抓取商品页面内容（如果是 URL）
    let productInfo = "";
    if (url && /^https?:\/\//.test(url)) {
      try {
        productInfo = await fetchProductInfo(url);
      } catch (e: any) {
        console.warn("Product fetch failed, continue with URL only:", e.message);
      }
    }
    const sharedTitle = extractedTitle || "";
    if (sharedTitle) productInfo = `商品标题: ${sharedTitle}` + (productInfo ? ` | ${productInfo}` : "");

    // 2. 调用 AI 深度分析
    const analyzeResult = await deepAnalyzeProduct(searchTarget, productInfo);
    if (isUndeliverableWorthBuyAnalysis(searchTarget, analyzeResult)) {
      return res.status(422).json({
        error: WORTHBUY_FAILURE_GUIDANCE.message,
        ...WORTHBUY_FAILURE_GUIDANCE,
      });
    }

    // 3. 保存到数据库（draft 状态，管理员审核后发布）
    // 优先从抓取信息/分享文案中提取商品标题作为品牌名
    const effectiveUserId = submittedBy || (req as any).userId || "";
    const extractedTitleFromInfo = productInfo.match(/商品标题:\s*(.+?)(?:\s*\||$)/)?.[1]?.trim() || "";
    const fallbackBrand = sharedTitle || analyzeResult.brand || analyzeResult.title || extractBrandFromUrl(url || "") || "";
    const brandName = incomingBrand || extractedTitleFromInfo || fallbackBrand || searchTarget.substring(0, 50);
    const existing = await WorthBuyAnalysis.findOne({ brand: brandName });
    const resultForSave = buildWorthBuyResultForSave({ analyzeResult, brandName, url });
    let savedItem: any;
    if (existing) {
      existing.result = resultForSave;
      existing.query = searchTarget;
      existing.submittedBy = effectiveUserId || existing.submittedBy || "";
      await existing.save();
      savedItem = existing.toObject();
    } else {
      const doc = await WorthBuyAnalysis.create({
        brand: brandName,
        query: searchTarget,
        submittedBy: effectiveUserId,
        status: "draft",
        result: resultForSave,
      });
      savedItem = doc.toObject();
    }

    return res.json({
      ...resultForSave,
      _id: savedItem._id,
      status: savedItem.status,
      analyzedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** 抓取商品页面信息 */
async function fetchProductInfo(url: string): Promise<string> {
  const initialPage = await fetchHtml(url);
  const html = initialPage.html;
  if (!html) return `来源: ${new URL(url).hostname}`;

  // 淘宝/天猫短链 → 解析真实商品 URL
  let realUrl = initialPage.finalUrl || url;
  const tbMatch = html.match(/url\s*=\s*['"](https:\/\/item\.(taobao|tmall)\.com[^'"]+)['"]/);
  if (tbMatch) {
    realUrl = tbMatch[1];
    const idMatch = realUrl.match(/[?&]id=(\d+)/);
    const priceMatch = realUrl.match(/[?&]price=(\d+)/);
    const parts: string[] = [];
    if (idMatch) parts.push(`淘宝商品ID: ${idMatch[1]}`);
    if (priceMatch) parts.push(`参考价格: ${priceMatch[1]}元`);
    if (parts.length > 0) return parts.join("，");

    // 尝试抓取真实商品页面（通常需要 cookie）
    const realPage = await fetchHtml(realUrl);
    if (realPage.html) {
      const info = extractProductInfo(realPage.html, realPage.finalUrl || realUrl);
      if (info && info.length > 3) return info;
    }
  }

  return extractProductInfo(html, realUrl);
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    redirect: "follow",
  }).catch(() => null);
  if (!resp || !resp.ok) return { html: "", finalUrl: url };
  return { html: await resp.text().catch(() => ""), finalUrl: resp.url || url };
}

export function isJdLikeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "3.cn" || hostname === "jd.com" || hostname.endsWith(".jd.com");
  } catch {
    return false;
  }
}

export function isGenericJdTitle(title: string): boolean {
  const compact = title
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "")
    .replace(/[，,。；;:：｜|_\-—–]+/g, "");

  if (!compact) return true;
  return [
    "多快好省购物上京东",
    "购物上京东",
    "京东",
    "京东JD.COM",
    "JDCOM",
  ].includes(compact) || /^京东网上商城/.test(compact);
}

function cleanExtractedTitle(title: string): string {
  return title
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

export function extractProductInfo(html: string, url: string): string {
  const parts: string[] = [];
  const isJdPage = isJdLikeUrl(url);

  // 尝试多种方式提取商品标题
  const titlePatterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /"title"\s*:\s*"([^"]+)"/,
    /"rawTitle"\s*:\s*"([^"]+)"/,
    /data-title\s*=\s*"([^"]+)"/,
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
  ];
  for (const pattern of titlePatterns) {
    const m = html.match(pattern);
    if (m && m[1] && m[1].trim() && !/^\s*$/.test(m[1]) && m[1].trim().length > 2) {
      const title = cleanExtractedTitle(m[1]);
      if (isJdPage && isGenericJdTitle(title)) continue;
      parts.push(`商品标题: ${title}`);
      break;
    }
  }

  // 提取描述
  const descPatterns = [
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    /"description"\s*:\s*"([^"]+)"/,
  ];
  for (const pattern of descPatterns) {
    const m = html.match(pattern);
    if (m && m[1] && m[1].trim().length > 5) {
      if (isJdPage && isGenericJdTitle(m[1])) continue;
      parts.push(`商品描述: ${m[1].trim().substring(0, 200)}`);
      break;
    }
  }

  // 京东特殊处理
  if (isJdPage) {
    const jdTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (jdTitle && jdTitle[1]) {
      // 京东标题通常是 "商品名【图片 价格 品牌】"
      const clean = cleanExtractedTitle(jdTitle[1].replace(/【[^】]*】/g, ""));
      if (clean && !parts.some(p => p.includes("商品标题"))) {
        if (isGenericJdTitle(clean)) {
          try {
            parts.push(`来源平台: ${new URL(url).hostname}`);
          } catch {}
        } else {
          parts.push(`商品标题: ${clean.substring(0, 200)}`);
        }
      }
    }
  }

  // 提取关键文本
  const textOnly = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);

  if (textOnly && textOnly.length > 20) {
    parts.push(`页面文本摘要: ${textOnly}`);
  }

  // 如果什么都没提取到，至少提供域名
  if (parts.length === 0) {
    try {
      const u = new URL(url);
      parts.push(`来源平台: ${u.hostname}`);
    } catch {}
  }

  return parts.join(" | ");
}

/** 从 URL 提取品牌名 */
function extractBrandFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").replace(/\.com(\.cn)?$/, "").replace(/\.(taobao|tmall|jd|pinduoduo|yangkeduo)/, "");
  } catch { return ""; }
}

/** AI 深度分析产品 */
async function deepAnalyzeProduct(searchTarget: string, productInfo: string): Promise<any> {
  // 始终转发到 /api/ai/analyze-product（使用 multi-agent store 的模型配置）
  const analyzeUrl = `http://127.0.0.1:${process.env.PORT || 3001}/api/ai/analyze-product`;
  const body: any = searchTarget.startsWith("http") ? { url: searchTarget } : { brand: searchTarget };
  if (productInfo) (body as any).productInfo = productInfo;
  
  const aiResp = await fetch(analyzeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await aiResp.json().catch(() => ({}));
  if (!aiResp.ok) throw new Error(data?.error || `分析失败: ${aiResp.status}`);
  return data;
}

export default router;
