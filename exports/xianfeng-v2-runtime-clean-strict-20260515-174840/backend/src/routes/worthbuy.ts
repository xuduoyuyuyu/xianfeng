import { Router, Request, Response } from "express";
import WorthBuyAnalysis from "../models/WorthBuyAnalysis";

const router = Router();

// GET 用户查看自己的提交列表（通过 submittedBy 或查询参数）
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || req.query.userId || "";
    const items = await WorthBuyAnalysis.find({ submittedBy: userId }).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE 用户删除自己的提交
router.delete("/my/:brand", async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).userId || "");
    const brand = decodeURIComponent(req.params.brand as string);
    const doc = await WorthBuyAnalysis.findOneAndDelete({ brand, submittedBy: userId });
    if (!doc) return res.status(404).json({ error: "未找到该分析或无权删除" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET 公开列表（只有 status=published 的）
router.get("/list", async (_req: Request, res: Response) => {
  try {
    const items = await WorthBuyAnalysis.find({ status: "published" }).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/worthbuy/check — 兼容前端轮询接口
router.get("/check", async (req: Request, res: Response) => {
  try {
    const brand = String(req.query.brand || "").trim();
    if (!brand) {
      return res.status(400).json({ status: "failed", error: "brand 为必填项" });
    }
    const item = await WorthBuyAnalysis.findOne({ brand }).lean();
    if (!item || !item.result) {
      return res.json({ status: "processing" });
    }
    return res.json({ status: "done", result: { ...item.result, brand: item.brand } });
  } catch (e: any) {
    return res.status(500).json({ status: "failed", error: e.message });
  }
});

// GET 单个详情（published 或 本人的 draft）
router.get("/:brand", async (req: Request, res: Response) => {
  try {
    const brand = decodeURIComponent(String(req.params.brand));
    const item = await WorthBuyAnalysis.findOne({ brand }).lean();
    if (!item) return res.status(404).json({ error: "未找到该分析" });

    // 如果是 draft/hidden，只有提交者和管理员能看
    if (item.status !== "published") {
      const userId = (req as any).userId || "";
      const isAdmin = (req as any).isAdmin === true;
      if (!isAdmin && item.submittedBy !== userId) {
        return res.status(403).json({ error: "该分析尚未公开" });
      }
    }

    res.json({ item });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST 提交新分析
router.post("/submit", async (req: Request, res: Response) => {
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

    // 3. 保存到数据库（draft 状态，管理员审核后发布）
    // 优先从抓取信息/分享文案中提取商品标题作为品牌名
    const effectiveUserId = submittedBy || (req as any).userId || "";
    const extractedTitleFromInfo = productInfo.match(/商品标题:\s*(.+?)(?:\s*\||$)/)?.[1]?.trim() || "";
    const fallbackBrand = sharedTitle || analyzeResult.brand || analyzeResult.title || extractBrandFromUrl(url || "") || "";
    const brandName = incomingBrand || extractedTitleFromInfo || fallbackBrand || searchTarget.substring(0, 50);
    const existing = await WorthBuyAnalysis.findOne({ brand: brandName });
    let savedItem: any;
    if (existing) {
      existing.result = { ...analyzeResult, url: url || null };
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
        result: { ...analyzeResult, url: url || null },
      });
      savedItem = doc.toObject();
    }

    return res.json({
      url: url || null,
      brand: brandName,
      ...analyzeResult,
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
  const html = await fetchHtml(url);
  if (!html) return `来源: ${new URL(url).hostname}`;

  // 淘宝/天猫短链 → 解析真实商品 URL
  let realUrl = url;
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
    const realHtml = await fetchHtml(realUrl);
    if (realHtml) {
      const info = extractProductInfo(realHtml, realUrl);
      if (info && info.length > 3) return info;
    }
  }

  return extractProductInfo(html, url);
}

async function fetchHtml(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    redirect: "follow",
  }).catch(() => null);
  if (!resp || !resp.ok) return "";
  return resp.text().catch(() => "");
}

function extractProductInfo(html: string, url: string): string {
  const parts: string[] = [];

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
      const title = m[1].trim().replace(/\s+/g, " ").substring(0, 200);
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
      parts.push(`商品描述: ${m[1].trim().substring(0, 200)}`);
      break;
    }
  }

  // 京东特殊处理
  if (url.includes("jd.com")) {
    const jdTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (jdTitle && jdTitle[1]) {
      // 京东标题通常是 "商品名【图片 价格 品牌】"
      const clean = jdTitle[1].replace(/【[^】]*】/g, "").trim();
      if (clean && !parts.some(p => p.includes("商品标题"))) {
        parts.push(`商品标题: ${clean.substring(0, 200)}`);
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
