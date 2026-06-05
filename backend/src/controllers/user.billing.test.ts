import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import { UserController } from "./user";

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

function currentChinaDateParts(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return {
    dateKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}

describe("user billing points", () => {
  let mongo: MongoMemoryServer;
  const controller = new UserController();

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("grants new registered accounts the current free daily points", async () => {
    const oldPublicRegister = process.env.ALLOW_PUBLIC_REGISTER;
    try {
      process.env.ALLOW_PUBLIC_REGISTER = "true";
      const req = {
        body: {
          username: "fresh-points-user",
          password: "secret123",
        },
      } as any;
      const res = createMockResponse();

      await controller.register(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.user.proPointBalance, 200);

      const saved = await User.findOne({ username: "fresh-points-user" }).lean();
      const { dateKey, monthKey } = currentChinaDateParts();
      assert.equal(saved?.proPointBalance, 200);
      assert.equal(saved?.proFreeGrantDate, dateKey);
      assert.equal(saved?.proFreeGrantMonth, monthKey);
      assert.equal(saved?.proFreeGrantedThisMonth, 200);
    } finally {
      if (oldPublicRegister === undefined) delete process.env.ALLOW_PUBLIC_REGISTER;
      else process.env.ALLOW_PUBLIC_REGISTER = oldPublicRegister;
    }
  });

  it("tops up legacy free users when their profile is read", async () => {
    const user = await User.create({
      username: "legacy-free-user",
      password: "hashed",
      proPointBalance: 0,
    });
    const req = { user: { id: String(user._id), role: "user" } } as any;
    const res = createMockResponse();

    await controller.meCompat(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.proPointBalance, 200);

    const saved = await User.findById(user._id).lean();
    assert.equal(saved?.proPointBalance, 200);
  });
});
