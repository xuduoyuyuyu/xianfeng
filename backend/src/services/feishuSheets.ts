import { FeishuBackfillValue } from "./mamaResourceFeishuBackfill";
import { getFeishuConfig } from "./feishuConfig";

type FeishuResponse<T> = { code: number; msg: string; data: T };

async function config() {
  const { appId, appSecret } = await getFeishuConfig();
  if (!appId || !appSecret) throw new Error("飞书回填未配置：请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  return { appId, appSecret };
}

async function feishuRequest<T>(path: string, init: RequestInit, token?: string, operation = "调用飞书接口"): Promise<T> {
  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json() as FeishuResponse<T> & Record<string, unknown>;
  if (!response.ok || body.code !== 0) {
    throw new Error(`${operation}失败：${body.msg || response.statusText}（飞书错误码 ${body.code ?? response.status}）`);
  }
  return body.data;
}

async function tenantToken(): Promise<string> {
  const { appId, appSecret } = await config();
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const body = await response.json() as { code: number; msg: string; tenant_access_token?: string };
  if (!response.ok || body.code !== 0 || !body.tenant_access_token) throw new Error(`飞书鉴权失败：${body.msg || response.statusText}`);
  return body.tenant_access_token;
}

export function parseFeishuSheetUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const sheetId = url.searchParams.get("sheet") || "";
  const parts = url.pathname.split("/").filter(Boolean);
  const wikiIndex = parts.indexOf("wiki");
  const sheetsIndex = parts.indexOf("sheets");
  if (!sheetId) throw new Error("飞书链接缺少 sheet 参数");
  if (sheetsIndex >= 0 && parts[sheetsIndex + 1]) return { sheetId, spreadsheetToken: parts[sheetsIndex + 1], wikiToken: "" };
  if (wikiIndex >= 0 && parts[wikiIndex + 1]) return { sheetId, spreadsheetToken: "", wikiToken: parts[wikiIndex + 1] };
  throw new Error("无法识别飞书电子表格链接");
}

async function resolveSheet(rawUrl: string, token: string) {
  const parsed = parseFeishuSheetUrl(rawUrl);
  if (parsed.spreadsheetToken) return parsed;
  const data = await feishuRequest<{ node: { obj_token: string; obj_type: string } }>(
    `/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.wikiToken)}`,
    { method: "GET" },
    token,
    "解析飞书知识库节点",
  );
  if (data.node?.obj_type !== "sheet" || !data.node?.obj_token) throw new Error("该飞书知识库节点不是电子表格");
  return { ...parsed, spreadsheetToken: data.node.obj_token };
}

export async function readFeishuSheet(rawUrl: string) {
  const token = await tenantToken();
  const sheet = await resolveSheet(rawUrl, token);
  const range = `${sheet.sheetId}!A1:ZZ2000`;
  const data = await feishuRequest<{ valueRange: { values?: FeishuBackfillValue[][] } }>(
    `/sheets/v2/spreadsheets/${encodeURIComponent(sheet.spreadsheetToken)}/values/${encodeURIComponent(range)}?valueRenderOption=ToString&dateTimeRenderOption=FormattedString`,
    { method: "GET" },
    token,
    "读取飞书电子表格",
  );
  return { token, sheet, values: data.valueRange?.values || [] };
}

export async function writeFeishuCells(rawUrl: string, cells: Array<{ cell: string; value: string | number }>) {
  const token = await tenantToken();
  const sheet = await resolveSheet(rawUrl, token);
  for (const item of cells) {
    const range = `${sheet.sheetId}!${item.cell}:${item.cell}`;
    await feishuRequest(
      `/sheets/v2/spreadsheets/${encodeURIComponent(sheet.spreadsheetToken)}/values`,
      { method: "PUT", body: JSON.stringify({ valueRange: { range, values: [[item.value]] } }) },
      token,
      `写入飞书单元格 ${item.cell}`,
    );
  }
}
