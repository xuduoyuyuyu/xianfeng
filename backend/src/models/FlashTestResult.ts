import mongoose from "mongoose";

export interface FlashTestDimensionScore {
  code: string;
  name: string;
  total: number;
  radarValue: number;
  level: string;
}

export interface FlashTestResult extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  assessmentId: "eight-talents";
  assessmentVersion: string;
  mode: "self" | "child";
  childId: string;
  childName: string;
  answers: number[];
  scores: FlashTestDimensionScore[];
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dimensionScoreSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    total: { type: Number, required: true, min: 5, max: 25 },
    radarValue: { type: Number, required: true, min: 1, max: 5 },
    level: { type: String, required: true },
  },
  { _id: false }
);

const flashTestResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assessmentId: { type: String, enum: ["eight-talents"], required: true, index: true },
    assessmentVersion: { type: String, required: true },
    mode: { type: String, enum: ["self", "child"], required: true, index: true },
    childId: { type: String, default: "", index: true },
    childName: { type: String, default: "" },
    answers: {
      type: [Number],
      required: true,
      validate: {
        validator(values: number[]) {
          return Array.isArray(values)
            && values.length === 40
            && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 5);
        },
        message: "answers must contain 40 integer values from 1 to 5",
      },
    },
    scores: { type: [dimensionScoreSchema], required: true },
    completedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

flashTestResultSchema.index({ userId: 1, completedAt: -1 });

export default mongoose.model<FlashTestResult>("FlashTestResult", flashTestResultSchema);
