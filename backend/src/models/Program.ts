import mongoose from "mongoose";

type ContentStatus = "draft" | "published";
type ParseStatus = "idle" | "parsing" | "success" | "failed";

interface Episode {
  title: string;
  duration: string;
  url: string;
}

interface ProgramSummary {
  headline: string;
  body: string;
  highlightLabel: string;
  highlightText: string;
  tags: string[];
}

interface TranscriptSegment {
  time: string;
  speaker: string;
  text: string;
  featured?: boolean;
}

interface ProgramGuest {
  name: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
}

interface CuratedReadingItem {
  title: string;
  subtitle?: string;
  url?: string;
}

interface ProgramDeepDive {
  sectionTitle?: string;
  curatedReading?: CuratedReadingItem[];
}

interface ProgramTermGlossaryItem {
  term: string;
  definition: string;
  sourceUrl?: string;
}

type ProgramDictionaryEntryId = mongoose.Types.ObjectId;

interface Program extends mongoose.Document {
  title: string;
  description: string;
  coverImage: string;
  episodes: Episode[];
  summary?: ProgramSummary;
  transcript?: TranscriptSegment[];
  termGlossary?: ProgramTermGlossaryItem[];
  dictionaryEntryIds?: ProgramDictionaryEntryId[];
  guest?: ProgramGuest;
  deepDive?: ProgramDeepDive;
  status: ContentStatus;
  publishedAt?: Date;
  parseStatus?: ParseStatus;
  parseStartedAt?: Date;
  parseFinishedAt?: Date;
  parseError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    episodes: [
      {
        title: { type: String, required: true },
        duration: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    summary: {
      headline: { type: String, default: "" },
      body: { type: String, default: "" },
      highlightLabel: { type: String, default: "" },
      highlightText: { type: String, default: "" },
      tags: [{ type: String }],
    },
    transcript: [
      {
        time: { type: String, required: true },
        speaker: { type: String, required: true },
        text: { type: String, required: true },
        featured: { type: Boolean, default: false },
      },
    ],
    termGlossary: [
      {
        term: { type: String, required: true },
        definition: { type: String, required: true },
        sourceUrl: { type: String, default: "" },
      },
    ],
    dictionaryEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EducationDictionaryEntry",
      },
    ],
    guest: {
      name: { type: String, default: "" },
      title: { type: String, default: "" },
      bio: { type: String, default: "" },
      avatar: { type: String, default: "" },
      profileUrl: { type: String, default: "" },
    },
    deepDive: {
      sectionTitle: { type: String, default: "" },
      curatedReading: [
        {
          title: { type: String, required: true },
          subtitle: { type: String, default: "" },
          url: { type: String, default: "" },
        },
      ],
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    parseStatus: {
      type: String,
      enum: ["idle", "parsing", "success", "failed"],
      default: "idle",
      index: true,
    },
    parseStartedAt: { type: Date, default: null },
    parseFinishedAt: { type: Date, default: null },
    parseError: { type: String, default: "" },
  },
  { timestamps: true }
);

const Program = mongoose.model<Program>("Program", programSchema);

export default Program;
export { Program, Episode, ContentStatus, ParseStatus };
