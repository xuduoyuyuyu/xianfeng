import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

import Book from "../models/Book";
import { remapHighConfidenceBookMetadataMatchesToBooks } from "../services/bookMetadataSampleService";
import { upsertBookMetadataFromMatch } from "../services/bookMetadataService";
import type { SampleMatchResult } from "../utils/bookMetadataSampleExport";

type MetadataReport = {
  threshold?: number;
  matches?: SampleMatchResult[];
  results?: SampleMatchResult[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function defaultMetadataFile() {
  const cwd = process.cwd();
  if (path.basename(cwd) === "backend") return path.resolve(cwd, "tmp/book-metadata-sample-high-confidence.json");
  return path.resolve(__dirname, "../../tmp/book-metadata-sample-high-confidence.json");
}

function parseArgs() {
  const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
  const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
  const dryRun = process.argv.includes("--dry-run");
  return {
    file: fileArg ? fileArg.slice("--file=".length) : defaultMetadataFile(),
    threshold: thresholdArg ? Number(thresholdArg.slice("--threshold=".length)) : undefined,
    dryRun,
  };
}

function getMongoUri() {
  return process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng";
}

async function readReport(file: string): Promise<MetadataReport> {
  const raw = await fs.readFile(path.resolve(file), "utf8");
  return JSON.parse(raw) as MetadataReport;
}

async function main() {
  const args = parseArgs();
  const report = await readReport(args.file);
  const matches = Array.isArray(report.matches) ? report.matches : Array.isArray(report.results) ? report.results : [];
  const threshold = args.threshold ?? Number(report.threshold || process.env.BOOK_METADATA_AUTO_APPROVE_THRESHOLD || 0.85);

  if (!matches.length) {
    console.log(JSON.stringify({ imported: 0, skipped: 0, total: 0, message: "no_matches" }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          source: args.file,
          threshold,
          total: matches.length,
          autoApproved: matches.filter((item) => Number(item.bestMatch?.matchScore || 0) >= threshold).length,
        },
        null,
        2
      )
    );
    return;
  }

  await mongoose.connect(getMongoUri());
  const currentBooks = await Book.find({}, { _id: 1, title: 1, author: 1, publisher: 1, coverImage: 1 }).lean();
  const remappedMatches = remapHighConfidenceBookMetadataMatchesToBooks(
    currentBooks.map((book: any) => ({
      _id: String(book?._id || ""),
      title: String(book?.title || ""),
      author: String(book?.author || ""),
      publisher: String(book?.publisher || ""),
      coverImage: String(book?.coverImage || ""),
    })),
    matches
  );
  let imported = 0;
  let skipped = 0;
  const skippedReasons: Record<string, number> = {};

  for (const match of remappedMatches) {
    const result = await upsertBookMetadataFromMatch(match, threshold);
    if (result.skipped) {
      skipped += 1;
      skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1;
    } else {
      imported += 1;
    }
  }

  await mongoose.disconnect();
  console.log(
    JSON.stringify(
      {
        source: args.file,
        threshold,
        sourceMatches: matches.length,
        remappedMatches: remappedMatches.length,
        imported,
        skipped,
        skippedReasons,
        total: remappedMatches.length,
      },
      null,
      2
    )
  );
}

main().catch(async (error) => {
  try {
    await mongoose.disconnect();
  } catch (_disconnectError) {
    // ignore disconnect failures during script shutdown
  }
  console.error(error);
  process.exit(1);
});
