"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 重新生成话题的深度内容
 * 用法: npx ts-node scripts/regenerate-topic.ts <slug或标题关键词>
 * 示例: npx ts-node scripts/regenerate-topic.ts 拼音启蒙
 */
const mongoose_1 = __importDefault(require("mongoose"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();
const MONGO_URI = process.env.MONGODB_URI || "mongodb://xianfeng_mongo:27017/xianfeng";
async function main() {
    const keyword = process.argv[2];
    if (!keyword) {
        console.error("Usage: npx ts-node scripts/regenerate-topic.ts <slug或标题关键词>");
        process.exit(1);
    }
    await mongoose_1.default.connect(MONGO_URI);
    console.log("Connected to MongoDB");
    const Topic = mongoose_1.default.model("Topic", new mongoose_1.default.Schema({}, { strict: false, collection: "topics" }));
    const topic = await Topic.findOne({
        $or: [
            { slug: { $regex: keyword, $options: "i" } },
            { title: { $regex: keyword, $options: "i" } },
        ],
        status: "pending",
    });
    if (!topic) {
        console.error(`No pending topic found matching "${keyword}"`);
        process.exit(1);
    }
    console.log(`Found: "${topic.title}" (${topic.slug})`);
    console.log(`Current progress: ${JSON.stringify(topic.generatingProgress)}`);
    // 计算节点总数
    const layers = topic.layers || {};
    let totalNodes = 0;
    for (const key of Object.keys(layers)) {
        if (Array.isArray(layers[key]))
            totalNodes += layers[key].length;
    }
    console.log(`Total nodes: ${totalNodes}`);
    // 重置进度
    topic.generatingProgress = { total: totalNodes, done: 0, status: "pending" };
    await topic.save();
    console.log("Progress reset, starting deep generation...");
    // 动态导入 AI 服务
    const { generateTopicWithDeepContent } = await Promise.resolve().then(() => __importStar(require("../src/services/topicAiGenerator.js")));
    const deepLayers = await generateTopicWithDeepContent({ title: topic.title, subtitle: topic.subtitle, tags: topic.tags || [] }, async (done, total) => {
        try {
            await Topic.findByIdAndUpdate(topic._id, {
                $set: { generatingProgress: { total, done, status: "generating" } },
            });
            console.log(`  Progress: ${done}/${total} (${Math.round((done / total) * 100)}%)`);
        }
        catch (_) { }
    });
    const updated = await Topic.findById(topic._id);
    if (updated) {
        updated.layers = deepLayers;
        updated.generatingProgress = { total: 0, done: 0, status: "done" };
        await updated.save();
        console.log(`✅ Deep generation complete for "${topic.title}"`);
        console.log(`   Content lengths: ${JSON.stringify(Object.fromEntries(Object.entries(deepLayers).map(([k, v]) => [
            k,
            v.map((n) => `${n.title}: ${(n.content || "").length} chars`),
        ])))}`);
    }
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
