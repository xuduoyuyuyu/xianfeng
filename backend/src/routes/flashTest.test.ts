import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import flashTestRoutes, {
  BASE_CHARACTER_RECOGNITION_VERSION,
  CHARACTER_RECOGNITION_VERSION,
  DEFAULT_ENGLISH_WORD_PACK_ID,
  EIGHT_TALENTS_VERSION,
  ENGLISH_PICTURE_NAMING_VERSION,
  ENGLISH_WORD_PACKS,
  LEGACY_CHARACTER_RECOGNITION_VERSION,
  matchesEnglishPictureWord,
  normalizeCharacterRecognitionSample,
  normalizePictureNamingAnswers,
  scoreCharacterRecognition,
  scoreEightTalents,
  scorePictureNaming,
} from "./flashTest";
import FlashTestResult from "../models/FlashTestResult";
import User from "../models/User";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import {
  ADVANCED_CHARACTER_RECOGNITION_BANK,
  CHARACTER_RECOGNITION_BANK,
} from "./characterRecognitionBank";

function tokenFor(userId: string) {
  return jwt.sign({ id: userId, role: "user" }, process.env.JWT_SECRET || "your-secret-key");
}

describe("flash test result routes", () => {
  const characterSample = CHARACTER_RECOGNITION_BANK.slice();
  let mongo: MongoMemoryServer;
  let server: import("node:http").Server;
  let baseUrl: string;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use("/api/flash-tests", flashTestRoutes);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected tcp server address");
    baseUrl = `http://127.0.0.1:${address.port}/api/flash-tests`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      FlashTestResult.deleteMany({}),
      User.deleteMany({}),
      UserXiaowanziSync.deleteMany({}),
    ]);
  });

  it("requires login before saving a result", async () => {
    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessmentId: "eight-talents",
        assessmentVersion: EIGHT_TALENTS_VERSION,
        mode: "self",
        answers: Array(40).fill(3),
      }),
    });
    assert.equal(response.status, 401);
  });

  it("rejects arbitrary text at the pronunciation boundary", async () => {
    const headers = { "Content-Type": "application/json" };
    const unknownWord = await fetch(`${baseUrl}/pronunciation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "english-word", itemId: "animal-unlisted" }),
    });
    const unknownCharacter = await fetch(`${baseUrl}/pronunciation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "chinese-character", character: "𠮷" }),
    });

    assert.equal(unknownWord.status, 400);
    assert.equal(unknownCharacter.status, 400);
  });

  it("returns a static MP3 for a fixed-bank Chinese character", async () => {
    const character = CHARACTER_RECOGNITION_BANK[0];
    const response = await fetch(`${baseUrl}/pronunciation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "chinese-character", character }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.text, character);
    assert.equal(body.language, "zh-CN");
    assert.equal(body.mimeType, "audio/mpeg");
    assert.equal(body.voiceType, "static-zh-cn-r1");
    assert.ok(Buffer.from(body.audioBase64, "base64").length > 4_000);
  });

  it("returns a static MP3 for a fixed-bank English word", async () => {
    const item = ENGLISH_WORD_PACKS[0].items[0];
    const response = await fetch(`${baseUrl}/pronunciation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "english-word", itemId: item.id }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.text, item.word);
    assert.equal(body.language, "en-US");
    assert.equal(body.mimeType, "audio/mpeg");
    assert.equal(body.voiceType, "static-en-gb-r5");
    assert.ok(Buffer.from(body.audioBase64, "base64").length > 3_000);
  });

  it("saves and returns only the current user's self-test history", async () => {
    const user = await User.create({ username: "flash-self", password: "hash" });
    const other = await User.create({ username: "flash-other", password: "hash" });
    await FlashTestResult.create({
      userId: other._id,
      assessmentId: "eight-talents",
      assessmentVersion: EIGHT_TALENTS_VERSION,
      mode: "self",
      answers: Array(40).fill(5),
      scores: [],
      completedAt: new Date(),
    });

    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenFor(String(user._id))}`,
      },
      body: JSON.stringify({
        assessmentId: "eight-talents",
        assessmentVersion: EIGHT_TALENTS_VERSION,
        mode: "self",
        answers: Array(40).fill(3),
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.result.mode, "self");
    assert.equal(body.result.scores.length, 8);
    assert.equal(body.result.scores[0].total, 15);
    assert.equal(body.result.scores[0].radarValue, 3);
    assert.equal("answers" in body.result, false);

    const list = await fetch(`${baseUrl}/results`, {
      headers: { Authorization: `Bearer ${tokenFor(String(user._id))}` },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.results.length, 1);
    assert.equal(listBody.results[0].id, body.result.id);
  });

  it("returns the latest result for the requested assessment subject", async () => {
    const user = await User.create({ username: "flash-latest", password: "hash" });
    const common = {
      userId: user._id,
      assessmentId: "eight-talents",
      assessmentVersion: EIGHT_TALENTS_VERSION,
      answers: Array(40).fill(3),
      scores: scoreEightTalents(Array(40).fill(3)),
    };
    const olderSelf = await FlashTestResult.create({
      ...common,
      mode: "self",
      completedAt: new Date("2026-08-10T08:00:00.000Z"),
    });
    const latestSelf = await FlashTestResult.create({
      ...common,
      mode: "self",
      completedAt: new Date("2026-08-11T08:00:00.000Z"),
    });
    const child = await FlashTestResult.create({
      ...common,
      mode: "child",
      childId: "child-1",
      childName: "小圆子",
      completedAt: new Date("2026-08-12T08:00:00.000Z"),
    });
    const headers = { Authorization: `Bearer ${tokenFor(String(user._id))}` };

    const selfResponse = await fetch(`${baseUrl}/results?assessmentId=eight-talents&mode=self&limit=1`, { headers });
    assert.equal(selfResponse.status, 200);
    const selfBody = await selfResponse.json();
    assert.deepEqual(selfBody.results.map((item: any) => item.id), [String(latestSelf._id)]);
    assert.notEqual(selfBody.results[0].id, String(olderSelf._id));

    const childResponse = await fetch(`${baseUrl}/results?assessmentId=eight-talents&mode=child&childId=child-1&limit=1`, { headers });
    assert.equal(childResponse.status, 200);
    const childBody = await childResponse.json();
    assert.deepEqual(childBody.results.map((item: any) => item.id), [String(child._id)]);
  });

  it("associates a child result only with an archive owned by the current user", async () => {
    const user = await User.create({ username: "flash-parent", password: "hash" });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-1", title: "小圆子", grade: "小学四年级" }],
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(String(user._id))}`,
    };
    const payload = {
      assessmentId: "eight-talents",
      assessmentVersion: EIGHT_TALENTS_VERSION,
      mode: "child",
      answers: Array(40).fill(4),
    };

    const missing = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, childId: "child-2" }),
    });
    assert.equal(missing.status, 404);

    const saved = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, childId: "child-1" }),
    });
    assert.equal(saved.status, 201);
    const savedBody = await saved.json();
    assert.equal(savedBody.result.childId, "child-1");
    assert.equal(savedBody.result.childName, "小圆子");
  });

  it("normalizes spoken English without trusting the client match status", () => {
    assert.equal(matchesEnglishPictureWord("A cat.", "cat"), true);
    assert.equal(matchesEnglishPictureWord("catch", "cat"), false);
    const itemIds = ENGLISH_WORD_PACKS[0].items.map((item) => item.id);
    const answers = normalizePictureNamingAnswers(itemIds.map((itemId, index) => ({
      itemId,
      recognizedText: index === 0 ? "A cat." : "different",
      status: index === 29 ? "skipped" : "matched",
    })));
    assert.ok(answers);
    assert.equal(answers[0].status, "matched");
    assert.equal(answers[1].status, "unmatched");
    assert.equal(answers[29].status, "skipped");
    assert.deepEqual(scorePictureNaming(answers), {
      totalCount: 30,
      matchedCount: 1,
      needsPracticeCount: 28,
      skippedCount: 1,
    });
  });

  it("accepts parent-confirmed word recognition without ASR text", () => {
    const words = ENGLISH_WORD_PACKS[0].items.map((item) => item.word);
    const answers = normalizePictureNamingAnswers(words.map((word, index) => ({
      itemId: `animal-${word}`,
      recognizedText: "",
      status: index < 6 ? "matched" : "skipped",
    })), "word");

    assert.ok(answers);
    assert.deepEqual(scorePictureNaming(answers), {
      totalCount: 30,
      matchedCount: 6,
      needsPracticeCount: 0,
      skippedCount: 24,
    });
  });

  it("validates all five collected word packs independently", () => {
    assert.equal(DEFAULT_ENGLISH_WORD_PACK_ID, "animals");
    assert.equal(ENGLISH_WORD_PACKS.length, 5);
    assert.equal(ENGLISH_WORD_PACKS.every((pack) => pack.items.length === 30), true);
    assert.equal(ENGLISH_WORD_PACKS.flatMap((pack) => pack.items).length, 150);
    assert.deepEqual(ENGLISH_WORD_PACKS.map((pack) => pack.items.slice(-5).map((item) => item.word)), [
      ["bee", "butterfly", "ant", "crab", "dolphin"],
      ["soup", "cookie", "candy", "pizza", "hamburger"],
      ["fork", "plate", "bowl", "key", "umbrella"],
      ["belt", "comb", "watch", "ring", "pendant"],
      ["grass", "forest", "snow", "rainbow", "rock"],
    ]);
    const foodPack = ENGLISH_WORD_PACKS.find((pack) => pack.id === "food");
    assert.ok(foodPack);
    const answers = normalizePictureNamingAnswers(foodPack.items.map((item, index) => ({
      itemId: item.id,
      recognizedText: "",
      status: index < 3 ? "matched" : "skipped",
    })), "word", "food");
    assert.ok(answers);
    assert.equal(answers[0].targetWord, "apple");
    assert.deepEqual(scorePictureNaming(answers), {
      totalCount: 30,
      matchedCount: 3,
      needsPracticeCount: 0,
      skippedCount: 27,
    });
    assert.equal(normalizePictureNamingAnswers(answers, "word", "animals"), null);
  });

  it("saves and restores a server-calibrated picture naming result for an owned child", async () => {
    const user = await User.create({ username: "flash-picture-words", password: "hash" });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-speaker", title: "小说家", grade: "小学一年级" }],
    });
    const words = ENGLISH_WORD_PACKS[0].items.map((item) => item.word);
    const pictureNamingAnswers = words.map((word, index) => ({
      itemId: `animal-${word}`,
      recognizedText: index < 7 ? word : index === 29 ? "" : "another word",
      status: index === 29 ? "skipped" : "matched",
    }));
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(String(user._id))}`,
    };

    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "english-picture-naming",
        assessmentVersion: ENGLISH_PICTURE_NAMING_VERSION,
        englishPromptMode: "picture",
        mode: "child",
        childId: "child-speaker",
        answers: [],
        pictureNamingAnswers,
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.result.childName, "小说家");
    assert.equal(body.result.englishPromptMode, "picture");
    assert.equal(body.result.englishWordPackId, "animals");
    assert.deepEqual(body.result.pictureNamingSummary, {
      totalCount: 30,
      matchedCount: 7,
      needsPracticeCount: 22,
      skippedCount: 1,
    });
    assert.equal(body.result.pictureNamingAnswers[7].status, "unmatched");

    const wordResponse = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "english-picture-naming",
        assessmentVersion: ENGLISH_PICTURE_NAMING_VERSION,
        englishPromptMode: "word",
        mode: "child",
        childId: "child-speaker",
        answers: [],
        pictureNamingAnswers,
      }),
    });
    assert.equal(wordResponse.status, 201);
    const wordBody = await wordResponse.json();
    assert.equal(wordBody.result.englishPromptMode, "word");
    assert.equal(wordBody.result.englishWordPackId, "animals");

    const foodPack = ENGLISH_WORD_PACKS.find((pack) => pack.id === "food");
    assert.ok(foodPack);
    const foodResponse = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "english-picture-naming",
        assessmentVersion: ENGLISH_PICTURE_NAMING_VERSION,
        englishPromptMode: "word",
        englishWordPackId: "food",
        mode: "child",
        childId: "child-speaker",
        answers: [],
        pictureNamingAnswers: foodPack.items.map((item, index) => ({
          itemId: item.id,
          recognizedText: "",
          status: index < 4 ? "matched" : "skipped",
        })),
      }),
    });
    assert.equal(foodResponse.status, 201);
    const foodBody = await foodResponse.json();
    assert.equal(foodBody.result.englishWordPackId, "food");
    assert.equal(foodBody.result.pictureNamingAnswers[0].targetWord, "apple");

    const list = await fetch(`${baseUrl}/results?assessmentId=english-picture-naming&englishPromptMode=picture&mode=child&childId=child-speaker&limit=1`, { headers });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.results[0].id, body.result.id);
    assert.equal(listBody.results[0].pictureNamingAnswers.length, 30);
    assert.equal(listBody.results[0].englishPromptMode, "picture");

    const wordList = await fetch(`${baseUrl}/results?assessmentId=english-picture-naming&englishPromptMode=word&englishWordPackId=animals&mode=child&childId=child-speaker&limit=1`, { headers });
    assert.equal(wordList.status, 200);
    const wordListBody = await wordList.json();
    assert.equal(wordListBody.results[0].id, wordBody.result.id);
    assert.equal(wordListBody.results[0].englishPromptMode, "word");
    assert.equal(wordListBody.results[0].englishWordPackId, "animals");
    assert.deepEqual(wordListBody.englishWordPackResults.animals, {
      resultId: wordBody.result.id,
      englishWordPackId: "animals",
      matchedCount: wordBody.result.pictureNamingSummary.matchedCount,
      totalCount: 30,
      completedAt: wordBody.result.completedAt,
    });
    assert.deepEqual(wordListBody.englishWordPackResults.food, {
      resultId: foodBody.result.id,
      englishWordPackId: "food",
      matchedCount: 4,
      totalCount: 30,
      completedAt: foodBody.result.completedAt,
    });
    assert.equal(wordListBody.englishWordPackResults["home-school"], null);

    const foodList = await fetch(`${baseUrl}/results?assessmentId=english-picture-naming&englishPromptMode=word&englishWordPackId=food&mode=child&childId=child-speaker&limit=1`, { headers });
    assert.equal(foodList.status, 200);
    const foodListBody = await foodList.json();
    assert.equal(foodListBody.results[0].id, foodBody.result.id);
    assert.equal(foodListBody.results[0].englishWordPackId, "food");
  });

  it("saves a server-scored exact 1600-character checklist for an owned child", async () => {
    const user = await User.create({ username: "flash-characters", password: "hash" });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-reader", title: "小读者", grade: "小学二年级" }],
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(String(user._id))}`,
    };
    const answers = [...Array(1216).fill(1), ...Array(384).fill(0)];
    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "character-recognition",
        assessmentVersion: LEGACY_CHARACTER_RECOGNITION_VERSION,
        mode: "child",
        childId: "child-reader",
        answers,
        sampleCharacters: characterSample,
        recognitionSummary: { recognizedCount: 800, estimateLabel: "伪造结果" },
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.result.assessmentId, "character-recognition");
    assert.equal(body.result.childName, "小读者");
    assert.deepEqual(body.result.scores, []);
    assert.deepEqual(body.result.answers, answers);
    assert.deepEqual(body.result.sampleCharacters, characterSample);
    assert.deepEqual(body.result.recognitionSummary, scoreCharacterRecognition(answers));
    assert.equal(body.result.recognitionSummary.completedRounds, 2);
    const savedResult = await FlashTestResult.findById(body.result.id).lean();
    assert.deepEqual(savedResult?.sampleCharacters, characterSample);

    const list = await fetch(`${baseUrl}/results?assessmentId=character-recognition&mode=child&childId=child-reader&limit=1`, {
      headers,
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.deepEqual(listBody.results[0].answers, answers);
    assert.deepEqual(listBody.results[0].sampleCharacters, characterSample);
    assert.equal(listBody.recognitionGroups[1].recognizedCount, 800);
    assert.equal(listBody.recognitionGroups[2].recognizedCount, 416);
  });

  it("keeps a completed first group as an exact 800-character result", async () => {
    const user = await User.create({ username: "flash-characters-base", password: "hash" });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-base", title: "小圆子", grade: "小学一年级" }],
    });
    const answers = [...Array(782).fill(1), ...Array(18).fill(0)];
    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenFor(String(user._id))}`,
      },
      body: JSON.stringify({
        assessmentId: "character-recognition",
        assessmentVersion: BASE_CHARACTER_RECOGNITION_VERSION,
        mode: "child",
        childId: "child-base",
        answers,
        sampleCharacters: characterSample.slice(0, 800),
      }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.result.recognitionSummary.recognizedCount, 782);
    assert.equal(body.result.recognitionSummary.sampledCount, 800);
    assert.equal(body.result.recognitionSummary.completedRounds, 1);
  });

  it("accepts the second 800-character group independently of the first group", async () => {
    const user = await User.create({ username: "flash-characters-locked", password: "hash" });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-locked", title: "小读者", grade: "小学一年级" }],
    });
    await FlashTestResult.create({
      userId: user._id,
      assessmentId: "character-recognition",
      assessmentVersion: CHARACTER_RECOGNITION_VERSION,
      mode: "child",
      childId: "child-locked",
      childName: "小读者",
      answers: [...Array(710).fill(1), ...Array(90).fill(0)],
      sampleCharacters: characterSample.slice(0, 800),
      scores: [],
      recognitionGroup: 1,
      recognitionSummary: scoreCharacterRecognition([...Array(710).fill(1), ...Array(90).fill(0)], 1),
      completedAt: new Date("2026-08-12T08:00:00.000Z"),
    });
    const response = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenFor(String(user._id))}`,
      },
      body: JSON.stringify({
        assessmentId: "character-recognition",
        assessmentVersion: CHARACTER_RECOGNITION_VERSION,
        mode: "child",
        childId: "child-locked",
        recognitionGroup: 2,
        answers: [...Array(200).fill(1), ...Array(600).fill(0)],
        sampleCharacters: ADVANCED_CHARACTER_RECOGNITION_BANK,
      }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.result.recognitionGroup, 2);
    assert.equal(body.result.recognitionSummary.sampledCount, 800);
    assert.equal(body.result.recognitionSummary.recognizedCount, 200);
    assert.equal(body.result.recognitionSummary.reference, "第 2 组 800 字逐字筛选结果");

    const list = await fetch(`${baseUrl}/results?assessmentId=character-recognition&mode=child&childId=child-locked&limit=1`, {
      headers: { Authorization: `Bearer ${tokenFor(String(user._id))}` },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.recognitionGroups[1].recognizedCount, 710);
    assert.equal(listBody.recognitionGroups[2].recognizedCount, 200);
  });

  it("rejects self mode or malformed answers for character recognition", async () => {
    const user = await User.create({ username: "flash-character-invalid", password: "hash" });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(String(user._id))}`,
    };
    const common = {
      assessmentId: "character-recognition",
      assessmentVersion: LEGACY_CHARACTER_RECOGNITION_VERSION,
      mode: "self",
      answers: Array(1600).fill(1),
      sampleCharacters: characterSample,
    };
    const selfMode = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify(common),
    });
    assert.equal(selfMode.status, 400);

    const malformed = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...common, mode: "child", childId: "missing", answers: Array(1599).fill(1) }),
    });
    assert.equal(malformed.status, 400);

    const wrongOrder = characterSample.slice();
    [wrongOrder[0], wrongOrder[1]] = [wrongOrder[1], wrongOrder[0]];
    assert.equal(normalizeCharacterRecognitionSample(wrongOrder), null);
  });

  it("rejects incomplete or stale test submissions", async () => {
    const user = await User.create({ username: "flash-invalid", password: "hash" });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(String(user._id))}`,
    };
    const incomplete = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "eight-talents",
        assessmentVersion: EIGHT_TALENTS_VERSION,
        mode: "self",
        answers: Array(39).fill(3),
      }),
    });
    assert.equal(incomplete.status, 400);

    const stale = await fetch(`${baseUrl}/results`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assessmentId: "eight-talents",
        assessmentVersion: "old-version",
        mode: "self",
        answers: Array(40).fill(3),
      }),
    });
    assert.equal(stale.status, 400);
  });
});
