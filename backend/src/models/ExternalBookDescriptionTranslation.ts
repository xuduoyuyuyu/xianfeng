import mongoose from "mongoose";

interface ExternalBookDescriptionTranslation extends mongoose.Document {
  externalBookId: string;
  title: string;
  sourceDescriptionHash: string;
  sourceDescription: string;
  translatedDescription: string;
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

const externalBookDescriptionTranslationSchema = new mongoose.Schema(
  {
    externalBookId: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, default: "", trim: true },
    sourceDescriptionHash: { type: String, required: true, trim: true },
    sourceDescription: { type: String, required: true },
    translatedDescription: { type: String, required: true },
    modelName: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

externalBookDescriptionTranslationSchema.index({ updatedAt: -1 });

const ExternalBookDescriptionTranslation = mongoose.model<ExternalBookDescriptionTranslation>(
  "ExternalBookDescriptionTranslation",
  externalBookDescriptionTranslationSchema
);

export default ExternalBookDescriptionTranslation;
export { ExternalBookDescriptionTranslation };
