import crypto from "crypto";

export type FeishuBackfillValue = string | number | boolean | null | Record<string, unknown> | FeishuBackfillValue[];

export type FeishuBackfillSource = {
  publicUid: string;
  displayName: string;
  accountName: string;
  profileUrl: string;
  followerCount: number | null;
  alipayAccount: string;
  alipayVerifiedName: string;
  publications: Array<{ contentUrl: string; publishedAt: string; proofLink: string }>;
};

export type FeishuBackfillChange = {
  rowNumber: number;
  uid: string;
  field: string;
  cell: string;
  value: string | number;
};

export type FeishuBackfillIssue = {
  rowNumber: number;
  uid: string;
  reason: string;
};

const HEADER_ALIASES: Record<string, string[]> = {
  uid: ["uid", "用户uid", "用户 uid"],
  displayName: ["达人名称", "用户昵称", "昵称"],
  accountName: ["账号名称", "账号昵称", "发布账号"],
  profileUrl: ["主页链接", "账号主页链接", "个人主页"],
  followerCount: ["粉丝数", "粉丝数量"],
  alipayAccount: ["支付宝账号", "支付宝账户"],
  alipayVerifiedName: ["支付宝姓名", "实名姓名", "支付宝实名姓名", "姓名"],
  contentUrl: ["稿件", "稿件的链接", "稿件链接", "下发链接", "专属内容链接"],
  publishedAt: ["发布时间", "发布日期"],
  proofLink: ["发布链接", "发布连接", "回传链接", "作品链接"],
};

function normalizedHeader(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[\s_：:]/g, "");
}

export function cellText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    for (const key of ["link", "url", "text", "value"]) {
      const text = cellText(source[key]);
      if (text) return text;
    }
  }
  return "";
}

export function columnName(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function findHeaderRow(values: FeishuBackfillValue[][]) {
  const aliases = new Map<string, string>();
  Object.entries(HEADER_ALIASES).forEach(([field, names]) => names.forEach((name) => aliases.set(normalizedHeader(name), field)));
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 20); rowIndex += 1) {
    const columns: Record<string, number> = {};
    values[rowIndex].forEach((value, columnIndex) => {
      const field = aliases.get(normalizedHeader(value));
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });
    if (columns.uid !== undefined && Object.keys(columns).length >= 3) return { rowIndex, columns };
  }
  throw new Error("未找到包含 UID 的表头，请确认表头位于前 20 行且字段名称未被修改");
}

function validPublicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.includes("feishu.cn") || host.includes("larksuite.com")) return false;
    if (host.includes("xiaohongshu.com") && /\/user\/profile\//i.test(url.pathname)) return false;
    return ["http:", "https:"].includes(url.protocol);
  } catch (_error) {
    return false;
  }
}

function comparableUrl(value: string): string {
  const extracted = firstHttpUrl(value) || value.trim();
  try {
    const url = new URL(extracted);
    url.hash = "";
    const pathParts = url.pathname.split("/").filter(Boolean);
    const wikiIndex = pathParts.indexOf("wiki");
    if ((url.hostname.endsWith("feishu.cn") || url.hostname.endsWith("larksuite.com")) && wikiIndex >= 0 && pathParts[wikiIndex + 1]) {
      return `feishu-wiki:${pathParts[wikiIndex + 1]}`;
    }
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return extracted;
  }
}

export function firstHttpUrl(value: string): string {
  const match = value.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return "";
  return match[0].replace(/[，。；、！？,.!?;:）)】\]}]+$/u, "");
}

export function buildFeishuBackfillPreview(
  values: FeishuBackfillValue[][],
  sourcesByUid: Map<string, FeishuBackfillSource>,
) {
  const { rowIndex: headerRowIndex, columns } = findHeaderRow(values);
  const changes: FeishuBackfillChange[] = [];
  const issues: FeishuBackfillIssue[] = [];
  const fieldValues: Array<[keyof FeishuBackfillSource, string]> = [
    ["displayName", "达人名称"],
    ["accountName", "账号名称"],
    ["profileUrl", "主页链接"],
    ["followerCount", "粉丝数"],
    ["alipayAccount", "支付宝账号"],
    ["alipayVerifiedName", "支付宝姓名"],
  ];
  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const uid = cellText(row[columns.uid]);
    if (!uid) continue;
    const source = sourcesByUid.get(uid);
    if (!source) {
      issues.push({ rowNumber: rowIndex + 1, uid, reason: "UID 在好赚后台不存在或未绑定账号资料" });
      continue;
    }
    for (const [sourceKey, label] of fieldValues) {
      const columnIndex = columns[sourceKey];
      const rawValue = source[sourceKey];
      const value = sourceKey === "profileUrl" ? firstHttpUrl(String(rawValue || "")) : rawValue;
      if (columnIndex === undefined || cellText(row[columnIndex]) || value === "" || value === null) continue;
      changes.push({ rowNumber: rowIndex + 1, uid, field: label, cell: `${columnName(columnIndex)}${rowIndex + 1}`, value: value as string | number });
    }
    const manuscript = columns.contentUrl === undefined ? "" : cellText(row[columns.contentUrl]);
    const publication = source.publications.find((item) => manuscript && comparableUrl(manuscript) === comparableUrl(item.contentUrl));
    if (!publication) continue;
    if (columns.publishedAt !== undefined && !cellText(row[columns.publishedAt]) && publication.publishedAt) {
      changes.push({ rowNumber: rowIndex + 1, uid, field: "发布时间", cell: `${columnName(columns.publishedAt)}${rowIndex + 1}`, value: publication.publishedAt });
    }
    if (columns.proofLink !== undefined && !cellText(row[columns.proofLink]) && publication.proofLink) {
      const proofLink = firstHttpUrl(publication.proofLink);
      if (validPublicationUrl(proofLink)) {
        changes.push({ rowNumber: rowIndex + 1, uid, field: "发布链接", cell: `${columnName(columns.proofLink)}${rowIndex + 1}`, value: proofLink });
      } else {
        changes.push({ rowNumber: rowIndex + 1, uid, field: "发布链接", cell: `${columnName(columns.proofLink)}${rowIndex + 1}`, value: publication.proofLink });
        issues.push({ rowNumber: rowIndex + 1, uid, reason: "回传内容不是有效发布链接，已原样填写，请人工拆分" });
      }
    }
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(changes)).digest("hex");
  return { headerRowNumber: headerRowIndex + 1, changes, issues, fingerprint };
}
