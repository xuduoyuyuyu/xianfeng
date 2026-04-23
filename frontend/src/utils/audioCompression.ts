import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const FFMPEG_CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const FFMPEG_CORE_URL = `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`;
const FFMPEG_WASM_URL = `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`;

const LOSSLESS_OUTPUT_EXTENSION = "flac";
const LOSSLESS_OUTPUT_MIME = "audio/flac";

export type AudioCompressionStage = "preparing" | "compressing" | "finalizing";

export type AudioCompressionErrorCode =
  | "UNSUPPORTED_BROWSER"
  | "INVALID_AUDIO_FILE"
  | "WASM_INIT_FAILED"
  | "COMPRESS_FAILED";

export class AudioCompressionError extends Error {
  code: AudioCompressionErrorCode;

  detail?: string;

  constructor(code: AudioCompressionErrorCode, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface CompressionInput {
  file: File;
}

export interface CompressionMeta {
  strategy: "ffmpeg_wasm_flac";
  outputFormat: "flac";
  originalName: string;
  originalMimeType: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface CompressionResult {
  file: File;
  meta: CompressionMeta;
}

export interface CompressAudioOptions {
  onStageChange?: (stage: AudioCompressionStage) => void;
  onProgress?: (progressPercent: number) => void;
}

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<boolean> | null = null;

function assertCompressionSupport(file: File): void {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new AudioCompressionError("UNSUPPORTED_BROWSER", "当前浏览器不支持音频压缩能力，请更换现代浏览器后重试。");
  }
  if (!file || !file.type.startsWith("audio/")) {
    throw new AudioCompressionError("INVALID_AUDIO_FILE", "请选择音频文件后再尝试压缩。");
  }
}

async function ensureFfmpegReady(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = ffmpegInstance
      .load({
        coreURL: FFMPEG_CORE_URL,
        wasmURL: FFMPEG_WASM_URL,
      })
      .catch((error: unknown) => {
        ffmpegLoadPromise = null;
        throw error;
      });
  }
  await ffmpegLoadPromise;
  return ffmpegInstance;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "audio";
  return name.slice(idx + 1).toLowerCase() || "audio";
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function compressAudioLossless(input: CompressionInput, options: CompressAudioOptions = {}): Promise<CompressionResult> {
  const { file } = input;
  assertCompressionSupport(file);

  const { onStageChange, onProgress } = options;
  onStageChange?.("preparing");
  onProgress?.(0);

  const ffmpeg = await ensureFfmpegReady().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AudioCompressionError("WASM_INIT_FAILED", "音频压缩引擎初始化失败，请稍后重试。", detail);
  });

  const inputExt = getFileExt(file.name);
  const inputFileName = `input-${Date.now()}.${inputExt}`;
  const outputFileName = `output-${Date.now()}.${LOSSLESS_OUTPUT_EXTENSION}`;

  let lastProgress = 0;
  const handleProgress = ({ progress }: { progress: number }) => {
    const next = toPercent(progress * 100);
    if (next <= lastProgress) return;
    lastProgress = next;
    onStageChange?.("compressing");
    onProgress?.(next);
  };

  ffmpeg.on("progress", handleProgress);
  try {
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));
    onStageChange?.("compressing");
    await ffmpeg.exec([
      "-i",
      inputFileName,
      "-map_metadata",
      "0",
      "-c:a",
      "flac",
      "-compression_level",
      "8",
      outputFileName,
    ]);
    onStageChange?.("finalizing");
    onProgress?.(100);

    const outputData = await ffmpeg.readFile(outputFileName);
    const bytes = typeof outputData === "string" ? new TextEncoder().encode(outputData) : outputData;
    const copiedBytes = new Uint8Array(bytes.byteLength);
    copiedBytes.set(bytes);
    const compressedBlob = new Blob([copiedBytes], { type: LOSSLESS_OUTPUT_MIME });
    const outputName = file.name.replace(/\.[^.]+$/, "") + `.${LOSSLESS_OUTPUT_EXTENSION}`;
    const compressedFile = new File([compressedBlob], outputName, { type: LOSSLESS_OUTPUT_MIME });
    const compressionRatio = file.size > 0 ? Number((compressedFile.size / file.size).toFixed(4)) : 1;

    return {
      file: compressedFile,
      meta: {
        strategy: "ffmpeg_wasm_flac",
        outputFormat: "flac",
        originalName: file.name,
        originalMimeType: file.type,
        originalSize: file.size,
        compressedSize: compressedFile.size,
        compressionRatio,
      },
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AudioCompressionError("COMPRESS_FAILED", "音频压缩失败，请重新选择文件后重试。", detail);
  } finally {
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_error) {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_error) {
      // ignore
    }
    ffmpeg.off("progress", handleProgress);
  }
}
