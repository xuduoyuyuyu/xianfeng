"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateByChars = truncateByChars;
exports.buildShowNotesKeyMomentsText = buildShowNotesKeyMomentsText;
exports.renderShowNotesTemplate = renderShowNotesTemplate;
exports.getShowNotesDefaultTemplate = getShowNotesDefaultTemplate;
exports.saveShowNotesDefaultTemplate = saveShowNotesDefaultTemplate;
exports.getDefaultShowNotesTemplate = getDefaultShowNotesTemplate;
const SystemSetting_1 = __importDefault(require("../models/SystemSetting"));
const SHOW_NOTES_TEMPLATE_SETTING_KEY = "showNotesDefaultTemplate";
const DEFAULT_SHOW_NOTES_TEMPLATE = [
    "导引",
    "{{guide}}",
    "",
    "嘉宾介绍",
    "{{guestIntro}}",
    "",
    "重点时间戳",
    "{{keyMoments}}",
    "",
    "本期纪要",
    "{{minutes}}",
].join("\n");
function asText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function toSingleLine(value) {
    return asText(value).replace(/\s+/g, " ");
}
function normalizeNewlines(value) {
    return String(value || "").replace(/\r\n?/g, "\n");
}
function truncateByChars(value, maxChars) {
    const text = asText(value);
    if (text.length <= maxChars)
        return text;
    return text.slice(0, Math.max(0, maxChars)).trim();
}
function buildShowNotesKeyMomentsText(input) {
    const list = Array.isArray(input) ? input : [];
    const rows = list
        .map((item) => {
        const time = toSingleLine(item?.time);
        const point = toSingleLine(item?.point || item?.title || item?.summary);
        if (!time || !point)
            return "";
        return `- ${time} ${point}`;
    })
        .filter(Boolean);
    return rows.join("\n");
}
function renderShowNotesTemplate(payload) {
    const template = normalizeNewlines(payload.template || "");
    const keyMomentsText = normalizeNewlines(payload.keyMomentsText || "");
    const rendered = template
        .replace(/\{\{\s*programTitle\s*\}\}/g, toSingleLine(payload.programTitle))
        .replace(/\{\{\s*guestName\s*\}\}/g, toSingleLine(payload.guestName))
        .replace(/\{\{\s*guide\s*\}\}/g, asText(payload.guide))
        .replace(/\{\{\s*guestIntro\s*\}\}/g, asText(payload.guestIntro))
        .replace(/\{\{\s*keyMoments\s*\}\}/g, keyMomentsText)
        .replace(/\{\{\s*minutes\s*\}\}/g, asText(payload.minutes))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return rendered;
}
async function getShowNotesDefaultTemplate() {
    const row = await SystemSetting_1.default.findOne({ key: SHOW_NOTES_TEMPLATE_SETTING_KEY }).lean();
    const value = asText(row?.value?.template);
    return value || DEFAULT_SHOW_NOTES_TEMPLATE;
}
async function saveShowNotesDefaultTemplate(template) {
    const normalized = normalizeNewlines(template).trim() || DEFAULT_SHOW_NOTES_TEMPLATE;
    await SystemSetting_1.default.findOneAndUpdate({ key: SHOW_NOTES_TEMPLATE_SETTING_KEY }, { key: SHOW_NOTES_TEMPLATE_SETTING_KEY, value: { template: normalized } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    return normalized;
}
function getDefaultShowNotesTemplate() {
    return DEFAULT_SHOW_NOTES_TEMPLATE;
}
