import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "learningMaterial.ts"), "utf8");

test("learning material create and update return actionable validation errors", () => {
  assert.match(source, /function formatLearningMaterialError\(error: any, fallback: string\)/);
  assert.match(source, /error\?\.code === 11000 && error\?\.keyPattern\?\.title/);
  assert.match(source, /资料标题已存在，请编辑已有资料或换一个标题/);
  assert.match(source, /error\?\.name === "ValidationError"/);
  assert.match(source, /message: formatLearningMaterialError\(error, "创建学习资料失败"\)/);
  assert.match(source, /message: formatLearningMaterialError\(error, "更新学习资料失败"\)/);
});

test("learning material mutations copy request body before normalization", () => {
  assert.match(source, /const payload = \{ \.\.\.req\.body \};/);
  assert.doesNotMatch(source, /const payload = req\.body;/);
});

test("learning material delete uses string-safe id query", () => {
  assert.match(source, /import mongoose from "mongoose";/);
  assert.match(source, /function idQuery\(id: string \| string\[\]\)/);
  assert.match(source, /\$toString: "\$_id"/);
  assert.match(source, /LearningMaterial\.findOneAndDelete\(idQuery\(id\)\)/);
  assert.doesNotMatch(source, /LearningMaterial\.findByIdAndDelete\(id\)/);
});

test("admin learning material detail and updates use string-safe id query", () => {
  assert.match(source, /LearningMaterial\.findOne\(idQuery\(id\)\)/);
  assert.match(source, /LearningMaterial\.findOneAndUpdate\(idQuery\(id\), payload,/);
  assert.match(source, /LearningMaterial\.findOneAndUpdate\(\s*idQuery\(id\),\s*statusUpdatePayload\(status\),/);
  assert.doesNotMatch(source, /LearningMaterial\.findById\(id\)/);
  assert.doesNotMatch(source, /LearningMaterial\.findByIdAndUpdate\(id/);
});

test("admin learning material list supports keyword search", () => {
  assert.match(source, /const search = asText\(req\.query\?\.search\);/);
  assert.match(source, /const pattern = new RegExp\(escapeRegex\(search\), "i"\);/);
  assert.match(source, /\{ title: pattern \}/);
  assert.match(source, /\{ description: pattern \}/);
  assert.match(source, /\{ category: pattern \}/);
});
