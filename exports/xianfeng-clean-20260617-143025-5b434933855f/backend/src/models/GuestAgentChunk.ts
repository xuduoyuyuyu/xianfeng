import mongoose from "mongoose";

export type GuestAgentSourceType =
  | "guest_profile"
  | "program_summary"
  | "program_transcript"
  | "program_quickview"
  | "program_shownotes"
  | "program_deepdive"
  | "public_material";

export interface GuestAgentChunk extends mongoose.Document {
  guestId: mongoose.Types.ObjectId;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  sourceTitle: string;
  locator: string;
  text: string;
  keywords: string[];
  weight: number;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

const guestAgentChunkSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true, index: true },
    sourceType: {
      type: String,
      enum: ["guest_profile", "program_summary", "program_transcript", "program_quickview", "program_shownotes", "program_deepdive", "public_material"],
      required: true,
      index: true,
    },
    sourceId: { type: String, default: "", trim: true, index: true },
    sourceTitle: { type: String, default: "", trim: true },
    locator: { type: String, default: "", trim: true },
    text: { type: String, required: true, trim: true },
    keywords: [{ type: String, trim: true }],
    weight: { type: Number, default: 1 },
    url: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

guestAgentChunkSchema.index({ guestId: 1, sourceType: 1, sourceId: 1, locator: 1 });
guestAgentChunkSchema.index({ guestId: 1, keywords: 1 });
guestAgentChunkSchema.index({ text: "text", sourceTitle: "text", keywords: "text" });

const GuestAgentChunkModel = mongoose.model<GuestAgentChunk>("GuestAgentChunk", guestAgentChunkSchema);

export default GuestAgentChunkModel;
