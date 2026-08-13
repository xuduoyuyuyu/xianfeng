import mongoose from "mongoose";

export interface FlashTestDimensionScore {
  code: string;
  name: string;
  total: number;
  radarValue: number;
  level: string;
}

export interface FlashTestRecognitionSummary {
  recognizedCount: number;
  sampledCount: number;
  cumulativeRecognizedCount: number;
  cumulativeSampledCount: number;
  completedRounds: number;
  estimatedMin: number;
  estimatedMax: number;
  estimateLabel: string;
  reference: string;
}

export interface FlashTestResult extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  assessmentId: "eight-talents" | "character-recognition";
  assessmentVersion: string;
  mode: "self" | "child";
  childId: string;
  childName: string;
  answers: number[];
  sampleCharacters: string[];
  scores: FlashTestDimensionScore[];
  recognitionSummary?: FlashTestRecognitionSummary;
  recognitionGroup?: 1 | 2;
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

const recognitionSummarySchema = new mongoose.Schema(
  {
    recognizedCount: { type: Number, required: true, min: 0, max: 1600 },
    sampledCount: { type: Number, required: true, enum: [800, 1600] },
    cumulativeRecognizedCount: { type: Number, required: true, min: 0, max: 1600 },
    cumulativeSampledCount: { type: Number, required: true, enum: [800, 1600] },
    completedRounds: { type: Number, required: true, min: 1 },
    estimatedMin: { type: Number, required: true, min: 0, max: 1600 },
    estimatedMax: { type: Number, required: true, min: 0, max: 1600 },
    estimateLabel: { type: String, required: true },
    reference: { type: String, required: true },
  },
  { _id: false }
);

const flashTestResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assessmentId: { type: String, enum: ["eight-talents", "character-recognition"], required: true, index: true },
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
            && (
              (values.length === 40 && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 5))
              || ([800, 1600].includes(values.length) && values.every((value) => value === 0 || value === 1))
            );
        },
        message: "answers do not match a supported flash test",
      },
    },
    sampleCharacters: { type: [String], default: [] },
    scores: { type: [dimensionScoreSchema], required: true },
    recognitionSummary: { type: recognitionSummarySchema, default: undefined },
    recognitionGroup: { type: Number, enum: [1, 2], default: 1 },
    completedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

flashTestResultSchema.index({ userId: 1, completedAt: -1 });

export default mongoose.model<FlashTestResult>("FlashTestResult", flashTestResultSchema);
