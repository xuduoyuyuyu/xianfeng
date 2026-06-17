import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import { ensureAdminAccount } from "./adminAccountRecovery";

describe("ensureAdminAccount", () => {
  let mongo: MongoMemoryServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it("creates a missing admin account with a hashed password", async () => {
    const result = await ensureAdminAccount({ username: "admin", password: "new-secret-1" });

    assert.equal(result.created, true);
    assert.equal(result.user.role, "admin");

    const saved = await User.findOne({ username: "admin" }).lean();
    assert.ok(saved);
    assert.notEqual(saved?.password, "new-secret-1");
    assert.equal(await bcryptjs.compare("new-secret-1", String(saved?.password)), true);
  });

  it("upgrades an existing user to admin and replaces the stored password hash", async () => {
    const oldPassword = await bcryptjs.hash("old-secret", 10);
    await User.create({
      username: "admin",
      password: oldPassword,
      role: "user",
    });

    const result = await ensureAdminAccount({ username: "admin", password: "reset-secret-2" });

    assert.equal(result.created, false);
    assert.equal(result.user.role, "admin");

    const saved = await User.findOne({ username: "admin" }).lean();
    assert.ok(saved);
    assert.equal(await bcryptjs.compare("old-secret", String(saved?.password)), false);
    assert.equal(await bcryptjs.compare("reset-secret-2", String(saved?.password)), true);
  });
});
