import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import UserPageVisit from "../models/UserPageVisit";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import MamaResourceProfile from "../models/MamaResourceProfile";
import MamaResourceTask from "../models/MamaResourceTask";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import { UserController } from "./user";

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("admin user overview", () => {
  let mongo: MongoMemoryServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("aggregates child profiles, page visits, Mama Haozhuan, and a chronological timeline", async () => {
    const user = await User.create({
      username: "u13800138000",
      mobile: "13800138000",
      password: "hashed",
      name: "测试妈妈",
    });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ name: "小宝", gender: "女孩", grade: "小学" }],
    });
    await UserPageVisit.create({
      userId: user._id,
      sessionId: "overview-test",
      pagePath: "/programs",
      pageTitle: "节目",
      deviceType: "mobile",
      visitedAt: new Date("2026-07-15T08:00:00.000Z"),
    });
    const profile = await MamaResourceProfile.create({
      userId: user._id,
      displayName: "测试妈妈",
      contactPhone: "13800138000",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://xhslink.com/test",
        normalizedProfileUrl: "xiaohongshu:test-overview",
      },
    });
    const task = await MamaResourceTask.create({ title: "测试发布任务", category: "亲子阅读" });
    await MamaResourceTaskAssignment.create({ taskId: task._id, profileId: profile._id });

    const req = { params: { id: String(user._id) } } as any;
    const res = createMockResponse();
    await new UserController().getOverview(req, res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.name, "测试妈妈");
    assert.equal(res.body.childProfiles[0].name, "小宝");
    assert.equal(res.body.mamaProfile.displayName, "测试妈妈");
    assert.equal(res.body.mamaAssignments[0].task.title, "测试发布任务");
    assert.equal(res.body.pageVisitCount, 1);
    assert.ok(res.body.timeline.some((item: any) => item.title === "注册账号"));
    assert.ok(res.body.timeline.some((item: any) => item.title === "访问页面" && item.detail === "节目"));
    assert.ok(res.body.timeline.some((item: any) => item.title === "领取妈妈好赚任务"));
  });
});
