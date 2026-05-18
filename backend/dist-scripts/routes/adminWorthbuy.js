"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const WorthBuyAnalysis_1 = __importDefault(require("../models/WorthBuyAnalysis"));
const axios_1 = __importDefault(require("axios"));
const VOLC_ENDPOINT = process.env.VOLCENGINE_PUBLIC_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";
const VOLC_API_KEY = process.env.VOLCENGINE_API_KEY || "";
const adminWorthbuyRouter = (0, express_1.Router)();
// 管理员获取所有分析（含 draft/hidden/published）
adminWorthbuyRouter.get("/", async (_req, res) => {
    try {
        const items = await WorthBuyAnalysis_1.default.find().sort({ createdAt: -1 }).lean();
        res.json({ items });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// 管理员创建品牌分析（支持完整 result 字段）
adminWorthbuyRouter.post("/", async (req, res) => {
    try {
        const { brand, query, status, result, submittedBy } = req.body || {};
        if (!brand || !brand.trim()) {
            return res.status(400).json({ error: "品牌名不能为空" });
        }
        // 检查 brand 唯一键是否重复
        const existing = await WorthBuyAnalysis_1.default.findOne({ brand: brand.trim() }).lean();
        if (existing) {
            return res.status(409).json({ error: `品牌「${brand.trim()}」已存在` });
        }
        const doc = await WorthBuyAnalysis_1.default.create({
            brand: brand.trim(),
            query: query || brand.trim(),
            submittedBy: submittedBy || "",
            status: status && ["draft", "published", "hidden"].includes(status) ? status : "draft",
            result: result || {
                score: 0,
                isIqTax: false,
                reason: "",
                pros: [],
                cons: [],
                businessModel: "",
                recommendation: "",
            },
        });
        res.status(201).json({ item: doc.toObject() });
    }
    catch (e) {
        // MongoDB duplicate key error
        if (e.code === 11000) {
            return res.status(409).json({ error: "品牌名已存在" });
        }
        res.status(500).json({ error: e.message });
    }
});
// 管理员更新品牌分析
adminWorthbuyRouter.put("/:id", async (req, res) => {
    try {
        const { brand, query, status, result, submittedBy } = req.body || {};
        const update = {};
        if (brand !== undefined)
            update.brand = brand;
        if (query !== undefined)
            update.query = query;
        if (submittedBy !== undefined)
            update.submittedBy = submittedBy;
        if (status !== undefined && ["draft", "published", "hidden"].includes(status))
            update.status = status;
        if (result !== undefined)
            update.result = result;
        const item = await WorthBuyAnalysis_1.default.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean();
        if (!item)
            return res.status(404).json({ error: "未找到该条目" });
        res.json({ item });
    }
    catch (e) {
        // MongoDB duplicate key error on brand
        if (e.code === 11000) {
            return res.status(409).json({ error: "品牌名已存在" });
        }
        res.status(500).json({ error: e.message });
    }
});
// 管理员更新状态
adminWorthbuyRouter.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!["draft", "published", "hidden"].includes(status)) {
            return res.status(400).json({ error: "status 只能为 draft/published/hidden" });
        }
        const item = await WorthBuyAnalysis_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
        if (!item)
            return res.status(404).json({ error: "未找到该条目" });
        res.json({ item });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ===== AI 生成品牌分析 =====
const worthbuyAiPrompt = (brand) => `你是一位资深消费分析师，专门做母婴/教育/家庭消费品的「值不值得买」分析。

请对「${brand}」做一份完整的值得买分析，直接返回 JSON（不要 markdown 代码块）：
{
  "score": 0-100 整数评分,
  "isIqTax": true/false 是否是智商税,
  "reason": "一句话总评（30字内）",
  "pros": ["优点1", "优点2", "优点3"],
  "cons": ["缺点1", "缺点2", "缺点3"],
  "businessModel": "商业模式分析（50-100字）",
  "recommendation": "推荐总结（100-200字）",
  "priceRange": "价格区间",
  "ratingDimensions": { "cost": 0-100, "quality": 0-100, "safety": 0-100, "experience": 0-100, "afterSales": 0-100 },
  "suitableFor": ["适用人群1", "适用人群2"],
  "notSuitableFor": ["不适用人群1", "不适用人群2"],
  "alternatives": [{"name":"替代品名","price":"价格","score":0-100,"reason":"推荐理由"}],
  "buyAdvice": "购买建议（100-200字）",
  "dataPoints": ["关键数据1", "关键数据2"],
  "commentAnalysis": "用户评论分析（100-200字）"
}

要求：
- 数据真实可信，有具体信息支撑
- 语言接地气，适合家长阅读
- 评分客观，不吹不黑
- 如果品牌不明确或无法分析，score 设为 0，reason 说明原因`;
adminWorthbuyRouter.post("/generate", async (req, res) => {
    try {
        const { brand } = req.body || {};
        if (!brand || !brand.trim()) {
            return res.status(400).json({ error: "品牌名不能为空" });
        }
        const brandName = brand.trim();
        // 检查是否已存在
        const existing = await WorthBuyAnalysis_1.default.findOne({ brand: brandName }).lean();
        if (existing) {
            return res.status(409).json({
                error: `品牌「${brandName}」已存在`,
                existingId: existing._id,
            });
        }
        let aiResult = null;
        if (VOLC_API_KEY) {
            try {
                const aiRes = await axios_1.default.post(`${VOLC_ENDPOINT}/chat/completions`, {
                    model: "deepseek-v3-250324",
                    messages: [{ role: "user", content: worthbuyAiPrompt(brandName) }],
                    temperature: 0.7,
                    max_tokens: 4096,
                    response_format: { type: "json_object" },
                }, {
                    headers: {
                        Authorization: `Bearer ${VOLC_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    timeout: 120000,
                });
                const text = aiRes.data?.choices?.[0]?.message?.content || "";
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    aiResult = JSON.parse(jsonMatch[0]);
                }
            }
            catch (aiErr) {
                console.error("Worthbuy AI generate error:", aiErr.message);
                // AI 失败时返回错误，让前端提示
                return res.status(502).json({ error: `AI 生成失败: ${aiErr.message}` });
            }
        }
        if (!aiResult) {
            return res.status(502).json({ error: "AI 服务不可用，请稍后重试" });
        }
        // 规范化 AI 返回
        const result = {
            score: Math.min(100, Math.max(0, Number(aiResult.score) || 50)),
            isIqTax: Boolean(aiResult.isIqTax),
            reason: String(aiResult.reason || "").slice(0, 100),
            pros: Array.isArray(aiResult.pros) ? aiResult.pros.slice(0, 5) : [],
            cons: Array.isArray(aiResult.cons) ? aiResult.cons.slice(0, 5) : [],
            businessModel: String(aiResult.businessModel || ""),
            recommendation: String(aiResult.recommendation || ""),
            priceRange: String(aiResult.priceRange || ""),
            ratingDimensions: {
                cost: Math.min(100, Math.max(0, Number(aiResult.ratingDimensions?.cost) || 50)),
                quality: Math.min(100, Math.max(0, Number(aiResult.ratingDimensions?.quality) || 50)),
                safety: Math.min(100, Math.max(0, Number(aiResult.ratingDimensions?.safety) || 50)),
                experience: Math.min(100, Math.max(0, Number(aiResult.ratingDimensions?.experience) || 50)),
                afterSales: Math.min(100, Math.max(0, Number(aiResult.ratingDimensions?.afterSales) || 50)),
            },
            suitableFor: Array.isArray(aiResult.suitableFor) ? aiResult.suitableFor.slice(0, 5) : [],
            notSuitableFor: Array.isArray(aiResult.notSuitableFor) ? aiResult.notSuitableFor.slice(0, 5) : [],
            alternatives: Array.isArray(aiResult.alternatives)
                ? aiResult.alternatives.slice(0, 3).map((a) => ({
                    name: String(a.name || ""),
                    price: String(a.price || ""),
                    score: Math.min(100, Math.max(0, Number(a.score) || 50)),
                    reason: String(a.reason || ""),
                }))
                : [],
            buyAdvice: String(aiResult.buyAdvice || ""),
            dataPoints: Array.isArray(aiResult.dataPoints) ? aiResult.dataPoints.slice(0, 8) : [],
            commentAnalysis: String(aiResult.commentAnalysis || ""),
            analyzedAt: new Date().toISOString(),
        };
        // 创建数据库记录
        const doc = await WorthBuyAnalysis_1.default.create({
            brand: brandName,
            query: brandName,
            submittedBy: req.userId || "",
            status: "draft",
            result,
        });
        res.status(201).json({ item: doc.toObject() });
    }
    catch (e) {
        if (e.code === 11000) {
            return res.status(409).json({ error: "品牌名已存在" });
        }
        res.status(500).json({ error: e.message });
    }
});
exports.default = adminWorthbuyRouter;
