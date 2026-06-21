import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { requirePro } from "./requirePro";

describe("requirePro", () => {
  let mongo: MongoMemoryServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("lets all users access Pro-gated features when Pro billing is disabled", async () => {
    const oldEnabled = process.env.PRO_BILLING_ENABLED;
    try {
      delete process.env.PRO_BILLING_ENABLED;
      const middleware = requirePro("xiaowanzi");
      let nextCalled = false;
      const req = { user: { id: "regular-user-id", role: "user" } } as any;
      const res = {
        status() {
          throw new Error("disabled Pro billing should not return a Pro gate response");
        },
        json() {
          throw new Error("disabled Pro billing should not return a Pro gate response");
        },
      } as any;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    } finally {
      if (oldEnabled === undefined) delete process.env.PRO_BILLING_ENABLED;
      else process.env.PRO_BILLING_ENABLED = oldEnabled;
    }
  });

  it("lets admin users access Pro-gated features without a membership check", async () => {
    const oldEnabled = process.env.PRO_BILLING_ENABLED;
    try {
      process.env.PRO_BILLING_ENABLED = "true";
      const middleware = requirePro("xiaowanzi");
      let nextCalled = false;
      const req = { user: { id: "admin-user-id", role: "admin" } } as any;
      const res = {
        status() {
          throw new Error("admin requests should not receive a Pro gate response");
        },
        json() {
          throw new Error("admin requests should not receive a Pro gate response");
        },
      } as any;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    } finally {
      if (oldEnabled === undefined) delete process.env.PRO_BILLING_ENABLED;
      else process.env.PRO_BILLING_ENABLED = oldEnabled;
    }
  });

  it("treats a token for a deleted user as an expired login instead of a Pro gate", async () => {
    const oldEnabled = process.env.PRO_BILLING_ENABLED;
    try {
      process.env.PRO_BILLING_ENABLED = "true";
      const middleware = requirePro("xiaowanzi");
      let nextCalled = false;
      const req = { user: { id: "64f000000000000000000001", role: "user" } } as any;
      const res = {
        statusCode: 0,
        body: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.body = payload;
        },
      } as any;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { message: "登录态已过期，请重新登录" });
    } finally {
      if (oldEnabled === undefined) delete process.env.PRO_BILLING_ENABLED;
      else process.env.PRO_BILLING_ENABLED = oldEnabled;
    }
  });
});
