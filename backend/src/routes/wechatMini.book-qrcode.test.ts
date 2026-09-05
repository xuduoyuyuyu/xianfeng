import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import router from "./wechatMini";
import Book from "../models/Book";
import { clearWechatMiniAccessTokenCache } from "../services/wechatMiniAuth";

const originalEnv = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  process.env = { ...originalEnv };
  clearWechatMiniAccessTokenCache();
});

async function request(query: Record<string, string>) {
  const route = router.stack.find((layer: any) => layer.route?.path === "/book-qrcode")?.route;
  assert.ok(route?.methods.get, "GET /book-qrcode must be registered");
  const result = { status: 200, headers: {} as Record<string, string>, body: undefined as any };
  const res = {
    status(code: number) { result.status = code; return this; },
    setHeader(key: string, value: string) { result.headers[key] = value; },
    json(body: unknown) { result.body = body; },
    send(body: unknown) { result.body = body; },
  };
  await route.stack[0].handle({ query }, res, () => {});
  return result;
}

function wechatImage(image: Buffer, error = false) {
  process.env.WECHAT_MINI_APP_ID = "test-app";
  process.env.WECHAT_MINI_APP_SECRET = "test-secret";
  delete process.env.WECHAT_MINI_QRCODE_ENV;
  const payloads: any[] = [];
  mock.method(globalThis, "fetch", async (url: any, init: any) => {
    if (String(url).includes("stable_token")) {
      return Response.json({ access_token: "test-token", expires_in: 7200 });
    }
    assert.equal(new URL(String(url)).pathname, "/wxa/getwxacodeunlimit");
    payloads.push(JSON.parse(init.body));
    return error ? Response.json({ errcode: 45009, errmsg: "quota exceeded" }) : new Response(image);
  });
  return payloads;
}

test("Chinese book QR returns image and preserves exact source scene", async () => {
  const bookId = "6a4d8e83a0619afdd8999ad3";
  mock.method(Book, "findOne", (filter: any) => {
    assert.deepEqual(filter, { _id: bookId, status: "published" });
    return { select: () => ({ lean: async () => ({ _id: bookId }) }) };
  });
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const payloads = wechatImage(image);
  const result = await request({ bookId, source: "xianfeng_zh" });
  assert.equal(result.status, 200);
  assert.equal(result.headers["content-type"], "image/png");
  assert.deepEqual(result.body, image);
  assert.equal(payloads[0].scene, `b=${bookId}`);
  assert.equal(payloads[0].page, "pages/webview/index");
  assert.equal(payloads[0].env_version, "release");
  assert.equal(payloads[0].check_path, true);
});

test("English book QR uses Readly identity without Chinese database lookup", async () => {
  mock.method(Book, "findOne", () => { throw new Error("unexpected Chinese lookup"); });
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const payloads = wechatImage(image);
  const result = await request({ bookId: "1985685480946917389", source: "readly_en" });
  assert.equal(result.status, 200);
  assert.equal(result.headers["content-type"], "image/jpeg");
  assert.deepEqual(result.body, image);
  assert.equal(payloads[0].scene, "e=1985685480946917389");
  assert.equal(payloads[0].page, "pages/webview/index");
});

test("invalid requests and unpublished books cannot generate QR images", async () => {
  mock.method(globalThis, "fetch", () => { throw new Error("unexpected upstream request"); });
  assert.equal((await request({})).status, 400);
  assert.equal((await request({ bookId: "123", source: "other" })).status, 400);
  assert.equal((await request({ bookId: "invalid" })).status, 404);
  assert.equal((await request({ bookId: "x".repeat(31), source: "readly_en" })).status, 400);
  mock.method(Book, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  assert.equal((await request({ bookId: "6a4d8e83a0619afdd8999ad3" })).status, 404);
});

test("WeChat generation errors are returned as errors rather than broken images", async () => {
  wechatImage(Buffer.alloc(0), true);
  const result = await request({ bookId: "1985685480946917389", source: "readly_en" });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "quota exceeded" });
  assert.equal(result.headers["content-type"], undefined);
});
