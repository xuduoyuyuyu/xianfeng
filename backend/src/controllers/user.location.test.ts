import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import { extractClientIp, resolveGeoFromIP, UserController } from "./user";

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("user geo backfill", () => {
  let mongo: MongoMemoryServer;
  const controller = new UserController();
  const originalFetch = globalThis.fetch;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    await User.deleteMany({});
  });

  it("prefers the first public forwarded IP", () => {
    const req = {
      headers: {
        "x-forwarded-for": "8.8.8.8, 10.0.0.1",
        "x-real-ip": "192.168.1.8",
      },
      ip: "127.0.0.1",
      socket: { remoteAddress: "::1" },
    } as any;

    assert.equal(extractClientIp(req), "8.8.8.8");
  });

  it("resolves both city and region from public IP", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ city: "上海", regionName: "上海市" }),
      }) as any) as typeof globalThis.fetch;

    const req = {
      headers: {
        "x-forwarded-for": "8.8.8.8, 10.0.0.1",
      },
      ip: "127.0.0.1",
      socket: { remoteAddress: "::1" },
    } as any;

    const result = await resolveGeoFromIP(req);

    assert.deepEqual(result, { city: "上海", region: "上海市" });
  });

  it("backfills city and region on normal username login", async () => {
    const password = "secret123";
    const hashed = await bcryptjs.hash(password, 10);
    await User.create({
      username: "geo-login-user",
      password: hashed,
      city: "",
      region: "",
      role: "user",
    });

    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ city: "杭州", regionName: "浙江省" }),
      }) as any) as typeof globalThis.fetch;

    const req = {
      body: { username: "geo-login-user", password },
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "::1" },
    } as any;
    const res = createMockResponse();

    await controller.login(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.city, "杭州");
    assert.equal(res.body.user.region, "浙江省");
    const saved = await User.findOne({ username: "geo-login-user" }).lean();
    assert.equal(saved?.city, "杭州");
    assert.equal(saved?.region, "浙江省");
  });
});
