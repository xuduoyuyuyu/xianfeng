import mongoose from "mongoose";

type DictionaryEntryStatus = "active" | "hidden";
type DictionaryEntryCreatedFrom = "ai_program" | "migration";

interface EducationDictionaryEntry extends mongoose.Document {
  term: string;
  normalizedTerm: string;
  definition: string;
  sourceUrl?: string;
  aliases: string[];
  relatedEntryIds: mongoose.Types.ObjectId[];
  programIds: mongoose.Types.ObjectId[];
  createdFrom: DictionaryEntryCreatedFrom;
  status: DictionaryEntryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const educationDictionaryEntrySchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true },
    normalizedTerm: { type: String, required: true, unique: true, index: true, trim: true },
    definition: { type: String, required: true, trim: true },
    sourceUrl: { type: String, default: "" },
    aliases: [{ type: String, trim: true }],
    relatedEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EducationDictionaryEntry",
      },
    ],
    programIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Program",
      },
    ],
    createdFrom: {
      type: String,
      enum: ["ai_program", "migration"],
      default: "ai_program",
    },
    status: {
      type: String,
      enum: ["active", "hidden"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

const EducationDictionaryEntry = mongoose.model<EducationDictionaryEntry>(
  "EducationDictionaryEntry",
  educationDictionaryEntrySchema
);

export default EducationDictionaryEntry;
export { EducationDictionaryEntry, DictionaryEntryStatus, DictionaryEntryCreatedFrom };
