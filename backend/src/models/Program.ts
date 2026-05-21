import mongoose from "mongoose";

type ContentStatus = "draft" | "published" | "group-only";
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

interface MindMapNode {
  title: string;
  summary: string;
  emoji?: string;
  source?: { type: string; time?: string; term?: string };
  children?: MindMapNode[];
}

interface MindMapData {
  root: MindMapNode;
  generatedAt?: Date;
}

interface ProgramDeepDive {
  sectionTitle?: string;
  curatedReading?: CuratedReadingItem[];
  mindMap?: MindMapData;
}

interface ProgramQuickViewItem {
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  summary: string;
  parent?: ProgramQuickViewItem;
}

interface ProgramMinutes {
  text: string;
}

interface ProgramShowNotesKeyMoment {
  time: string;
  point: string;
}

interface ProgramShowNotes {
  guide: string;
  guestIntro: string;
  keyMoments: ProgramShowNotesKeyMoment[];
  renderedText: string;
  templateOverride?: string;
}

interface ProgramContentPack {
  quickView?: ProgramQuickViewItem[];
  minutes?: ProgramMinutes;
  showNotes?: ProgramShowNotes;
}

interface ProgramTermGlossaryItem {
  term: string;
  definition: string;
  sourceUrl?: string;
  aliases?: string[];
}

type ProgramDictionaryEntryId = mongoose.Types.ObjectId;
type ProgramGuestId = mongoose.Types.ObjectId;

interface ProgramGuestBinding {
  guestId: ProgramGuestId;
  order: number;
  role: string;
}

interface AgentProofreadReport {
  typoCount?: number;
  punctuationChanges?: number;
  terminologyWarnings?: number;
  summary?: string;
}

interface AgentProofreadOutput {
  taskId?: mongoose.Types.ObjectId;
  generatedAt?: Date;
  correctedTranscript?: TranscriptSegment[];
  report?: AgentProofreadReport;
  acceptedAt?: Date;
  acceptedBy?: string;
}

interface AgentProgramEnrichmentOutput {
  taskId?: mongoose.Types.ObjectId;
  generatedAt?: Date;
  forceOverwrite?: boolean;
  suggestedGlossary?: ProgramTermGlossaryItem[];
  suggestedReadings?: CuratedReadingItem[];
}

interface ProgramAgentOutputs {
  proofread?: AgentProofreadOutput;
  enrichment?: AgentProgramEnrichmentOutput;
}

interface Program extends mongoose.Document {
  programCode?: string;
  title: string;
  description: string;
  coverImage: string;
  episodes: Episode[];
  summary?: ProgramSummary;
  transcript?: TranscriptSegment[];
  termGlossary?: ProgramTermGlossaryItem[];
  dictionaryEntryIds?: ProgramDictionaryEntryId[];
  guestBindings?: ProgramGuestBinding[];
  guest?: ProgramGuest;
  deepDive?: ProgramDeepDive;
  contentPack?: ProgramContentPack;
  agentOutputs?: ProgramAgentOutputs;
  status: ContentStatus;
  publishedAt?: Date;
  parseStatus?: ParseStatus;
  parseStage?: string;
  parseProgress?: number;
  parseStartedAt?: Date;
  parseFinishedAt?: Date;
  parseError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new mongoose.Schema(
  {
    programCode: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
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
        aliases: [{ type: String }],
      },
    ],
    dictionaryEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EducationDictionaryEntry",
      },
    ],
    guestBindings: [
      {
        guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true },
        order: { type: Number, default: 1 },
        role: { type: String, default: "main_guest" },
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
      mindMap: {
        root: {
          title: { type: String, default: "" },
          summary: { type: String, default: "" },
          emoji: { type: String, default: "" },
          source: {
            type: { type: String, default: "" },
            time: { type: String, default: "" },
            term: { type: String, default: "" },
          },
          children: [{ type: mongoose.Schema.Types.Mixed }],
        },
        generatedAt: { type: Date },
      },
    },
    contentPack: {
      quickView: [
        {
          startTime: { type: String, default: "" },
          endTime: { type: String, default: "" },
          timeRangeLabel: { type: String, default: "" },
          summary: { type: String, default: "" },
        },
      ],
      minutes: {
        text: { type: String, default: "" },
      },
      showNotes: {
        guide: { type: String, default: "" },
        guestIntro: { type: String, default: "" },
        keyMoments: [
          {
            time: { type: String, default: "" },
            point: { type: String, default: "" },
          },
        ],
        renderedText: { type: String, default: "" },
        templateOverride: { type: String, default: "" },
      },
    },
    agentOutputs: {
      proofread: {
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentTask", default: null },
        generatedAt: { type: Date, default: null },
        correctedTranscript: [
          {
            time: { type: String, required: true },
            speaker: { type: String, required: true },
            text: { type: String, required: true },
            featured: { type: Boolean, default: false },
          },
        ],
        report: {
          typoCount: { type: Number, default: 0 },
          punctuationChanges: { type: Number, default: 0 },
          terminologyWarnings: { type: Number, default: 0 },
          summary: { type: String, default: "" },
        },
        acceptedAt: { type: Date, default: null },
        acceptedBy: { type: String, default: "" },
      },
      enrichment: {
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentTask", default: null },
        generatedAt: { type: Date, default: null },
        forceOverwrite: { type: Boolean, default: false },
        suggestedGlossary: [
          {
            term: { type: String, required: true },
            definition: { type: String, required: true },
            sourceUrl: { type: String, default: "" },
            aliases: [{ type: String }],
          },
        ],
        suggestedReadings: [
          {
            title: { type: String, required: true },
            subtitle: { type: String, default: "" },
            url: { type: String, default: "" },
          },
        ],
      },
    },
    status: {
      type: String,
      enum: ["draft", "published", "group-only"],
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
    parseStage: { type: String, default: "idle" },
    parseProgress: { type: Number, default: 0 },
    parseStartedAt: { type: Date, default: null },
    parseFinishedAt: { type: Date, default: null },
    parseError: { type: String, default: "" },
  },
  { timestamps: true }
);

const Program = mongoose.model<Program>("Program", programSchema);

export default Program;
export { Program, Episode, ContentStatus, ParseStatus };
