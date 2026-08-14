import { randomUUID } from "node:crypto";

type PronunciationLanguage = "zh-CN" | "en-US";

type SynthesisOptions = {
  appId?: string;
  accessToken?: string;
  endpoint?: string;
  voiceType?: string;
  fetchImpl?: typeof fetch;
};

export async function synthesizeFlashTestPronunciation(
  text: string,
  language: PronunciationLanguage,
  userId: string,
  options: SynthesisOptions = {}
) {
  const appId = String(options.appId || process.env.VOLCENGINE_APP_ID || "").trim();
  const accessToken = String(options.accessToken || process.env.VOLCENGINE_ACCESS_TOKEN || "").trim();
  if (!appId || !accessToken) {
    throw new Error("火山引擎语音合成未配置");
  }

  const voiceType = String(
    options.voiceType
      || (language === "en-US"
        ? process.env.VOLCENGINE_TTS_ENGLISH_VOICE_TYPE
        : process.env.VOLCENGINE_TTS_CHINESE_VOICE_TYPE)
      || process.env.VOLCENGINE_TTS_VOICE_TYPE
      || "BV001_streaming"
  ).trim();
  const endpoint = String(
    options.endpoint
      || process.env.VOLCENGINE_TTS_ENDPOINT
      || "https://openspeech.bytedance.com/api/v1/tts"
  ).trim();
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer;${accessToken}`,
      },
      body: JSON.stringify({
        app: { appid: appId, token: "access_token", cluster: "volcano_tts" },
        user: { uid: String(userId || "flash-test-user") },
        audio: {
          voice_type: voiceType,
          encoding: "mp3",
          speed_ratio: language === "en-US" ? 0.82 : 0.9,
          volume_ratio: 1,
          pitch_ratio: 1,
        },
        request: {
          reqid: randomUUID().replaceAll("-", ""),
          text,
          text_type: "plain",
          operation: "query",
        },
      }),
      signal: controller.signal,
    });
    const payload = await upstream.json() as { code?: number; message?: string; data?: string };
    if (!upstream.ok || Number(payload.code) !== 3000 || !payload.data) {
      const message = String(payload.message || `HTTP ${upstream.status}`);
      if (/requested resource not granted|access denied|grant not found/i.test(message)) {
        throw new Error("火山引擎语音合成资源尚未开通");
      }
      throw new Error(`火山引擎语音合成失败：${message}`);
    }
    return { audioBase64: payload.data, mimeType: "audio/mpeg", voiceType };
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("读音生成超时，请重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
