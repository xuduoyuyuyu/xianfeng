import mongoose from "mongoose";

export interface ITopicLayerNode {
  key?: string;
  title: string;
  summary: string;
  content: string; // 展开讲讲内容
  icon?: string;
}

export interface ITopicLayers {
  layer1: ITopicLayerNode[]; // 认知篇
  layer2: ITopicLayerNode[]; // 诊断篇
  layer3: ITopicLayerNode[]; // 方法篇
  layer4: ITopicLayerNode[]; // 工具篇
  layer5: ITopicLayerNode[]; // 行动篇
}

export interface ITopic extends mongoose.Document {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  coverEmoji: string;
  shortSummary: string;
  tags: string[];
  viewCount: number;
  questionCount: number;
  status: "pending" | "published" | "hidden";
  source: "system" | "ai" | "user"; // 话题来源
  createdBy?: string; // 创建者标识（user 来源时）
  userOriginalInput?: string; // 用户提交的原始输入内容，仅管理员可见
  suitableGrades: string[]; // 适配年级，如 ["小学1-3年级", "小学4-6年级"]
  layers: ITopicLayers;
  generatingProgress?: {
    total: number;
    done: number;
    status: "pending" | "generating" | "done" | "error";
  };
  hiddenForUsers?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const topicLayerNodeSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    title: { type: String, default: "" },
    summary: { type: String, default: "" },
    content: { type: String, default: "" },
    icon: { type: String, default: "" },
  },
  { _id: false }
);

const topicLayersSchema = new mongoose.Schema(
  {
    layer1: { type: [topicLayerNodeSchema], default: [] },
    layer2: { type: [topicLayerNodeSchema], default: [] },
    layer3: { type: [topicLayerNodeSchema], default: [] },
    layer4: { type: [topicLayerNodeSchema], default: [] },
    layer5: { type: [topicLayerNodeSchema], default: [] },
  },
  { _id: false }
);

const topicSchema = new mongoose.Schema<ITopic>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    coverEmoji: { type: String, default: "📚" },
    shortSummary: { type: String, default: "" },
    tags: { type: [String], default: [] },
    viewCount: { type: Number, default: 0 },
    questionCount: { type: Number, default: 0 },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "published", "hidden"],
    },
    source: {
      type: String,
      default: "system",
      enum: ["system", "ai", "user"],
    },
    createdBy: { type: String, default: "" },
    userOriginalInput: { type: String, default: "" },
    suitableGrades: { type: [String], default: [] },
    layers: {
      type: topicLayersSchema,
      default: () => ({
        layer1: [],
        layer2: [],
        layer3: [],
        layer4: [],
        layer5: [],
      }),
    },
    generatingProgress: {
      type: {
        total: Number,
        done: Number,
        status: String, // pending | generating | done | error
      },
      default: undefined,
    },
    hiddenForUsers: { type: [String], default: [] },
  },
  { timestamps: true }
);

topicSchema.index({ tags: 1 });
topicSchema.index({ status: 1, createdAt: -1 });

// 自动从 title 生成 slug
topicSchema.pre("validate", function () {
  if (!this.slug && this.title) {
    this.slug =
      this.title
        .replace(/[^\w\u4e00-\u9fff]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 80) || `topic-${Date.now()}`;
  }
});

export default mongoose.model<ITopic>("Topic", topicSchema);
