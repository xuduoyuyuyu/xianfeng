import mongoose from "mongoose";

type ContentStatus = "draft" | "published";

interface LearningMaterial extends mongoose.Document {
  title: string;
  description: string;
  fileUrl: string;
  category: string;
  status: ContentStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const learningMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    fileUrl: { type: String, required: true },
    category: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const LearningMaterial = mongoose.model<LearningMaterial>(
  "LearningMaterial",
  learningMaterialSchema
);

export default LearningMaterial;
export { LearningMaterial, ContentStatus };
