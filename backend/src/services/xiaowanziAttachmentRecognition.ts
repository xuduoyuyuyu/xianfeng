import { ensureStore } from "./agentModelRegistry";

const XIAOWANZI_VOLCENGINE_ENDPOINT_ID = "ep-m-20260510222218-mv5t9";
const XIAOWANZI_VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export function parseXiaowanziImageDataUrl(value: unknown): { mediaType: string; dataUrl: string } | null {
  const dataUrl = String(value || "").trim();
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return {
    mediaType: match[1].toLowerCase(),
    dataUrl,
  };
}

function resolveXiaowanziFileModelConfig() {
  const store = ensureStore(() => ({
    agents: [],
    prompts: {},
    policies: {},
    strategies: {},
    runs: [],
  }));
  const configuredModelId = String(process.env.XIAOWANZI_VOLCENGINE_ENDPOINT_ID || XIAOWANZI_VOLCENGINE_ENDPOINT_ID).trim();
  const registryItem = (store.model_registry || []).find((item: any) => {
    if (!item?.enabled) return false;
    return item.id === configuredModelId || item.model_name === configuredModelId || item.id === "doubao-seedream-5-0-260128";
  });
  return {
    provider: "Volcengine Ark",
    modelName: configuredModelId,
    apiKey: String(process.env.XIAOWANZI_VOLCENGINE_API_KEY || process.env.ARK_API_KEY || registryItem?.api_key || "").trim(),
    baseUrl: String(process.env.XIAOWANZI_VOLCENGINE_ARK_BASE_URL || process.env.ARK_BASE_URL || registryItem?.base_url || XIAOWANZI_VOLCENGINE_ARK_BASE_URL).trim(),
  };
}

export async function callXiaowanziVolcengineImageModel(input: {
  imageDataUrl: string;
  prompt?: string;
}) {
  const modelCfg = resolveXiaowanziFileModelConfig();
  if (!modelCfg.apiKey || !modelCfg.modelName) {
    throw new Error("小玩子图片文件处理模型未配置完整（缺少 api_key 或 model）");
  }
  const endpoint = `${modelCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const prompt = String(input.prompt || "").trim() || "请识别这张图片里的文字、关键内容和家长需要注意的信息。";
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${modelCfg.apiKey}`,
    },
    body: JSON.stringify({
      model: modelCfg.modelName,
      messages: [
        {
          role: "system",
          content: "你是小玩子的火山引擎图片文件处理助手。请客观识别图片内容，优先输出可供后续育儿咨询使用的文字、场景、关键事实和风险点。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1200,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(`火山引擎图片识别调用失败(${modelCfg.provider}/${modelCfg.modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
  }
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  return {
    content: content || "（图片识别模型返回空内容）",
    model: modelCfg.modelName,
    provider: modelCfg.provider,
  };
}

export async function recognizeXiaowanziImageDataUrl(input: {
  dataUrl: unknown;
  prompt?: unknown;
}) {
  const image = parseXiaowanziImageDataUrl(input.dataUrl);
  if (!image) {
    const error = new Error("当前仅支持图片识别，请上传图片文件");
    (error as any).statusCode = 400;
    throw error;
  }
  if (image.dataUrl.length > 12 * 1024 * 1024) {
    const error = new Error("图片过大，请压缩到 8MB 以内后重试");
    (error as any).statusCode = 413;
    throw error;
  }
  const result = await callXiaowanziVolcengineImageModel({
    imageDataUrl: image.dataUrl,
    prompt: String(input.prompt || ""),
  });
  return {
    type: "xiaowanzi_file_recognition",
    featureKey: "xiaowanzi_file",
    mediaType: image.mediaType,
    content: result.content,
    model: result.model,
    provider: result.provider,
  };
}
