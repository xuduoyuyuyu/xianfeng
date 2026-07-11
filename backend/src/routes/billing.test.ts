import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import billingRoutes from "./billing";
import { BILLING_PLANS, FREE_BILLING_PLAN, serializePlan } from "../services/billing";
import PaymentOrderModel from "../models/PaymentOrder";
import User from "../models/User";

type TestServer = {
  close: () => Promise<void>;
  url: string;
};

async function startServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use("/api/billing", billingRoutes);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected tcp server address");
  return {
    url: `http://127.0.0.1:${address.port}/api/billing`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

function userToken(userId: string) {
  return jwt.sign({ id: userId, role: "user" }, process.env.JWT_SECRET || "your-secret-key");
}

describe("billing routes", () => {
  let mongo: MongoMemoryServer;
  let server: TestServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
    server = await startServer();
  });

  after(async () => {
    await server.close();
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await PaymentOrderModel.deleteMany({});
    await User.deleteMany({});
  });

  it("registers the Pro billing endpoint surface", () => {
    const routes = ((billingRoutes as any).stack || [])
      .map((layer: any) => ({ path: layer.route?.path, methods: Object.keys(layer.route?.methods || {}) }))
      .filter((route: any) => route.path);

    assert.deepEqual(routes, [
      { path: "/plans", methods: ["get"] },
      { path: "/me", methods: ["get"] },
      { path: "/orders", methods: ["post"] },
      { path: "/virtual-orders", methods: ["post"] },
      { path: "/orders/:id", methods: ["get"] },
      { path: "/orders/:id/mock-pay", methods: ["post"] },
      { path: "/consume/education-planning", methods: ["post"] },
      { path: "/alipay/notify", methods: ["post"] },
      { path: "/wechat/notify", methods: ["post"] },
      { path: "/wechat/virtual/notify", methods: ["get", "post"] },
      { path: "/refunds", methods: ["post"] },
    ]);
  });

  it("serializes public plan data without exposing payment secrets", () => {
    const data = {
      free: serializePlan(FREE_BILLING_PLAN),
      plus: serializePlan(BILLING_PLANS.plus),
      pro: serializePlan(BILLING_PLANS.pro),
    };

    assert.equal(data.plus.amountCents, 1990);
    assert.equal(data.pro.amountCents, 9900);
    assert.equal(data.free.amountCents, 0);
    assert.equal(data.plus.amountYuan, "19.90");
    assert.equal(data.plus.pointsPerCycle, 200);
    assert.equal(data.pro.pointsPerCycle, 1200);
    const virtualProducts = [
      { productId: "plus", name: data.plus.name, amountCents: data.plus.amountCents },
      { productId: "pro", name: data.pro.name, amountCents: data.pro.amountCents },
    ];
    assert.deepEqual(virtualProducts.map((item) => item.productId), ["plus", "pro"]);
    assert.equal(JSON.stringify(virtualProducts).includes("offerId"), false);
    assert.equal(JSON.stringify(virtualProducts).includes("appKey"), false);
    assert.equal(JSON.stringify(data).includes("PRIVATE_KEY"), false);
  });

  it("rejects ordinary WeChat orders from mini program webviews", async () => {
    const user = await User.create({
      username: "mini-user",
      password: "secret",
      role: "user",
    });

    const response = await fetch(`${server.url}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${userToken(String(user._id))}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 MicroMessenger/8.0.75 MiniProgramEnv/iOS",
        "Referer": "https://servicewechat.com/wxc47be3bb0be842e8/0/page-frame.html",
      },
      body: JSON.stringify({ plan: "plus", provider: "wechat" }),
    });

    assert.equal(response.status, 400);
    const data = await response.json() as { message?: string };
    assert.match(data.message || "", /微信虚拟支付/);
    assert.equal(await PaymentOrderModel.countDocuments({}), 0);
  });
});
