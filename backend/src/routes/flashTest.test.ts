import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import flashTestRoutes, { EIGHT_TALENTS_VERSION, scoreEightTalents } from "./flashTest";
import FlashTestResult from "../models/FlashTestResult";
import User from "../models/User";
import UserXiaowanziSync from "../models/UserXiaowanziSync";

function tokenFor(userId: string) {
  return jwt.sign({ id: userId, role: "user" }, process.env.JWT_SECRET || "your-secret-key");
}

describe("flash test result routes", () => {
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
