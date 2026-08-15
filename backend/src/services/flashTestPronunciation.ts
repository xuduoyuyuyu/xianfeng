import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type StaticPronunciationOptions = {
  assetDirectory?: string;
};

type StaticSynthesisOptions = {
  apiKey?: string;
  endpoint?: string;
  resourceId?: string;
  voiceType?: string;
  fetchImpl?: typeof fetch;
};

export const DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY = path.resolve(
  __dirname,
  "../assets/flash-test/chinese-pronunciation"
);
export const DEFAULT_ENGLISH_PRONUNCIATION_ASSET_DIRECTORY = path.resolve(
  __dirname,
  "../assets/flash-test/english-pronunciation"
);

export function getChinesePronunciationAssetPath(
  character: string,
  options: StaticPronunciationOptions = {}
) {
  const codePoint = Array.from(character)[0]?.codePointAt(0);
  if (codePoint === undefined) throw new Error("汉字读音无效");
  return path.join(
    options.assetDirectory || DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY,
    `${codePoint.toString(16)}.mp3`
  );
}

export async function readStaticChinesePronunciation(
  character: string,
  options: StaticPronunciationOptions = {}
) {
  try {
    const audio = await fs.readFile(getChinesePronunciationAssetPath(character, options));
    return {
      audioBase64: audio.toString("base64"),
      mimeType: "audio/mpeg",
      voiceType: "static-zh-cn-r1",
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new Error("汉字读音静态资源尚未生成");
    throw error;
  }
}

export function getEnglishPronunciationAssetPath(
  word: string,
  options: StaticPronunciationOptions = {}
) {
  const normalizedWord = String(word || "").trim().toLowerCase();
  if (!/^[a-z]+$/.test(normalizedWord)) throw new Error("英文单词读音无效");
  return path.join(
    options.assetDirectory || DEFAULT_ENGLISH_PRONUNCIATION_ASSET_DIRECTORY,
    `${normalizedWord}.mp3`
  );
}

export async function readStaticEnglishPronunciation(
  word: string,
  options: StaticPronunciationOptions = {}
) {
  try {
    const audio = await fs.readFile(getEnglishPronunciationAssetPath(word, options));
    return {
      audioBase64: audio.toString("base64"),
      mimeType: "audio/mpeg",
      voiceType: "static-en-gb-r5",
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new Error("英文单词读音静态资源尚未生成");
    throw error;
  }
}

export async function synthesizeStaticChinesePronunciation(
  text: string,
  options: StaticSynthesisOptions = {}
) {
  const apiKey = String(
    options.apiKey || process.env.VOLCENGINE_TTS_GENERATION_API_KEY || ""
  ).trim();
  if (!apiKey) throw new Error("火山引擎静态语音生成 API Key 未配置");

  const endpoint = String(
    options.endpoint || "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
  ).trim();
  const resourceId = String(options.resourceId || "seed-tts-2.0").trim();
  const voiceType = String(options.voiceType || "zh_female_vv_uranus_bigtts").trim();
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const upstream = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": randomUUID(),
      },
      body: JSON.stringify({
        req_params: {
          text,
          speaker: voiceType,
          audio_params: {
            format: "mp3",
            sample_rate: 24000,
          },
        },
      }),
      signal: controller.signal,
    });
    const responseText = await upstream.text();
    const chunks = responseText
      .split("\n")
      .map((line) => line.trim().replace(/^data:\s*/, ""))
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { code?: number; message?: string; data?: string });
    const failedChunk = chunks.find((chunk) => {
      const code = Number(chunk.code);
      return Number.isFinite(code) && code !== 0 && code !== 20000000;
    });
    const audioBase64 = Buffer.concat(
      chunks.filter((chunk) => chunk.data).map((chunk) => Buffer.from(chunk.data!, "base64"))
    ).toString("base64");
    if (!upstream.ok || failedChunk || !audioBase64) {
      const message = String(failedChunk?.message || `HTTP ${upstream.status}`);
      throw new Error(`火山引擎静态语音生成失败：${message}`);
    }
    return { audioBase64, mimeType: "audio/mpeg", voiceType };
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("静态读音生成超时，请重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
