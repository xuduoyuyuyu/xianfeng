import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildWechatMiniProgramPaymentParams,
  createWechatMiniProgramCheckout,
  decryptWechatResource,
  isWechatNotifyAppIdAllowed,
  queryWechatOrderByOutTradeNo,
} from "./paymentProviders";

function encryptResource(payload: Record<string, any>, apiV3Key: string) {
  const nonce = "nonce-123456";
  const associatedData = "transaction";
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    algorithm: "AEAD_AES_256_GCM",
    ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
    associated_data: associatedData,
    nonce,
  };
}

describe("wechat payment provider", () => {
  it("decrypts API v3 notify resources", () => {
    const apiV3Key = "12345678901234567890123456789012";
    const payload = {
      out_trade_no: "XFPRO123",
      transaction_id: "4200000000000000001",
      trade_state: "SUCCESS",
      amount: { total: 1990, currency: "CNY" },
    };

    assert.deepEqual(decryptWechatResource(encryptResource(payload, apiV3Key), apiV3Key), payload);
  });

  it("builds signed mini-program requestPayment params from a prepay id", () => {
    const originalAppId = process.env.WECHAT_PAY_APP_ID;
    const originalPrivateKey = process.env.WECHAT_PAY_PRIVATE_KEY;
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    try {
      process.env.WECHAT_PAY_APP_ID = "wx-mini-app";
      process.env.WECHAT_PAY_PRIVATE_KEY = privateKey;
      const params = buildWechatMiniProgramPaymentParams("prepay-123", new Date("2026-06-30T08:00:00.000Z"));
      const message = `wx-mini-app\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`;

      assert.equal(params.timeStamp, "1782806400");
      assert.equal(params.package, "prepay_id=prepay-123");
      assert.equal(params.signType, "RSA");
      assert.equal(
        crypto.createVerify("RSA-SHA256").update(message).end().verify(publicKey, params.paySign, "base64"),
        true
      );
    } finally {
      if (originalAppId === undefined) delete process.env.WECHAT_PAY_APP_ID;
      else process.env.WECHAT_PAY_APP_ID = originalAppId;
      if (originalPrivateKey === undefined) delete process.env.WECHAT_PAY_PRIVATE_KEY;
      else process.env.WECHAT_PAY_PRIVATE_KEY = originalPrivateKey;
    }
  });

  it("falls back to mock checkout when the configured mini-program key file is missing locally", async () => {
    const oldEnv = {
      nodeEnv: process.env.NODE_ENV,
      enableMock: process.env.BILLING_ENABLE_MOCK_PAY,
      disableMock: process.env.BILLING_DISABLE_MOCK_PAY,
      mchId: process.env.WECHAT_PAY_MCH_ID,
      appId: process.env.WECHAT_PAY_APP_ID,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    };
    try {
      process.env.NODE_ENV = "development";
      process.env.BILLING_ENABLE_MOCK_PAY = "true";
      delete process.env.BILLING_DISABLE_MOCK_PAY;
      process.env.WECHAT_PAY_MCH_ID = "1900000001";
      process.env.WECHAT_PAY_APP_ID = "wx-mini-app";
      process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
      process.env.WECHAT_PAY_SERIAL_NO = "serial-no";
      delete process.env.WECHAT_PAY_PRIVATE_KEY;
      process.env.WECHAT_PAY_PRIVATE_KEY_PATH = "/tmp/xianfeng-missing-apiclient-key.pem";

      const checkout = await createWechatMiniProgramCheckout({ _id: "order-1" } as any, "openid-1");

      assert.equal(checkout.mode, "mock");
      assert.equal(checkout.mockPayUrl, "/api/billing/orders/order-1/mock-pay");
    } finally {
      restoreWechatEnv(oldEnv);
    }
  });

  it("reuses host-style key paths through the mounted secrets directory", async () => {
    const oldEnv = {
      nodeEnv: process.env.NODE_ENV,
      enableMock: process.env.BILLING_ENABLE_MOCK_PAY,
      disableMock: process.env.BILLING_DISABLE_MOCK_PAY,
      gateway: process.env.WECHAT_PAY_GATEWAY,
      mchId: process.env.WECHAT_PAY_MCH_ID,
      appId: process.env.WECHAT_PAY_APP_ID,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    };
    const originalCwd = process.cwd();
    const originalFetch = globalThis.fetch;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xf-wechat-pay-"));
    const secretsDir = path.join(tempRoot, "secrets");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    try {
      fs.mkdirSync(secretsDir);
      fs.writeFileSync(path.join(secretsDir, "apiclient_key.pem"), privateKey);
      process.chdir(tempRoot);
      process.env.NODE_ENV = "development";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      process.env.BILLING_DISABLE_MOCK_PAY = "true";
      process.env.WECHAT_PAY_GATEWAY = "https://wechat-pay.test";
      process.env.WECHAT_PAY_MCH_ID = "1900000001";
      process.env.WECHAT_PAY_APP_ID = "wx-mini-app";
      process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
      process.env.WECHAT_PAY_SERIAL_NO = "serial-no";
      delete process.env.WECHAT_PAY_PRIVATE_KEY;
      process.env.WECHAT_PAY_PRIVATE_KEY_PATH = "/Volumes/not-mounted/xianfeng/backend/secrets/apiclient_key.pem";
      globalThis.fetch = (async (url: any) => {
        assert.equal(String(url), "https://wechat-pay.test/v3/pay/transactions/jsapi");
        return new Response(JSON.stringify({ prepay_id: "prepay-mounted-key" }), { status: 200 });
      }) as any;

      const checkout = await createWechatMiniProgramCheckout({
        _id: "order-1",
        subject: "家长先疯 Pro",
        outTradeNo: "XFPRO123",
        amountCents: 1990,
      } as any, "openid-1");

      assert.equal(checkout.mode, "wechat_jsapi");
      assert.equal(checkout.paymentParams?.package, "prepay_id=prepay-mounted-key");
    } finally {
      process.chdir(originalCwd);
      globalThis.fetch = originalFetch;
      restoreWechatEnv(oldEnv);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses the mini-program app id for JSAPI checkout when pay app id differs", async () => {
    const oldEnv = {
      nodeEnv: process.env.NODE_ENV,
      enableMock: process.env.BILLING_ENABLE_MOCK_PAY,
      disableMock: process.env.BILLING_DISABLE_MOCK_PAY,
      gateway: process.env.WECHAT_PAY_GATEWAY,
      mchId: process.env.WECHAT_PAY_MCH_ID,
      appId: process.env.WECHAT_PAY_APP_ID,
      miniAppId: process.env.WECHAT_MINI_APP_ID,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    };
    const originalFetch = globalThis.fetch;
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    try {
      process.env.NODE_ENV = "development";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      process.env.BILLING_DISABLE_MOCK_PAY = "true";
      process.env.WECHAT_PAY_GATEWAY = "https://wechat-pay.test";
      process.env.WECHAT_PAY_MCH_ID = "1900000001";
      process.env.WECHAT_PAY_APP_ID = "wx-web-pay-app";
      process.env.WECHAT_MINI_APP_ID = "wx-mini-program";
      process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
      process.env.WECHAT_PAY_SERIAL_NO = "serial-no";
      process.env.WECHAT_PAY_PRIVATE_KEY = privateKey;
      delete process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
      globalThis.fetch = (async (_url: any, options: any) => {
        const body = JSON.parse(String(options?.body || "{}"));
        assert.equal(body.appid, "wx-mini-program");
        return new Response(JSON.stringify({ prepay_id: "prepay-mini-app" }), { status: 200 });
      }) as any;

      const checkout = await createWechatMiniProgramCheckout({
        _id: "order-1",
        subject: "家长先疯 Pro",
        outTradeNo: "XFPRO123",
        amountCents: 1990,
      } as any, "openid-from-mini-program");
      const params = checkout.paymentParams;
      assert.ok(params);
      const signedMessage = `wx-mini-program\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`;

      assert.equal(params.package, "prepay_id=prepay-mini-app");
      assert.equal(
        crypto.createVerify("RSA-SHA256").update(signedMessage).end().verify(publicKey, params.paySign, "base64"),
        true
      );
    } finally {
      globalThis.fetch = originalFetch;
      restoreWechatEnv(oldEnv);
    }
  });

  it("accepts mini-program app id in WeChat pay notify when it differs from web pay app id", () => {
    const oldEnv = {
      appId: process.env.WECHAT_PAY_APP_ID,
      miniAppId: process.env.WECHAT_MINI_APP_ID,
    };
    try {
      process.env.WECHAT_PAY_APP_ID = "wx-web-pay-app";
      process.env.WECHAT_MINI_APP_ID = "wx-mini-program";

      assert.equal(isWechatNotifyAppIdAllowed("wx-web-pay-app"), true);
      assert.equal(isWechatNotifyAppIdAllowed("wx-mini-program"), true);
      assert.equal(isWechatNotifyAppIdAllowed("wx-other-app"), false);
    } finally {
      restoreWechatEnv(oldEnv);
    }
  });

  it("queries WeChat order status by merchant out_trade_no", async () => {
    const oldEnv = {
      nodeEnv: process.env.NODE_ENV,
      enableMock: process.env.BILLING_ENABLE_MOCK_PAY,
      disableMock: process.env.BILLING_DISABLE_MOCK_PAY,
      gateway: process.env.WECHAT_PAY_GATEWAY,
      mchId: process.env.WECHAT_PAY_MCH_ID,
      appId: process.env.WECHAT_PAY_APP_ID,
      miniAppId: process.env.WECHAT_MINI_APP_ID,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    };
    const originalFetch = globalThis.fetch;
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    try {
      process.env.NODE_ENV = "development";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      process.env.BILLING_DISABLE_MOCK_PAY = "true";
      process.env.WECHAT_PAY_GATEWAY = "https://wechat-pay.test";
      process.env.WECHAT_PAY_MCH_ID = "1900000001";
      process.env.WECHAT_PAY_APP_ID = "wx-mini-app";
      process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
      process.env.WECHAT_PAY_SERIAL_NO = "serial-no";
      process.env.WECHAT_PAY_PRIVATE_KEY = privateKey;
      delete process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
      globalThis.fetch = (async (url: any, options: any) => {
        assert.equal(String(url), "https://wechat-pay.test/v3/pay/transactions/out-trade-no/XFPRO123?mchid=1900000001");
        assert.equal(options?.method, "GET");
        assert.equal("body" in options, false);
        assert.match(String(options?.headers?.Authorization || ""), /WECHATPAY2-SHA256-RSA2048/);
        return new Response(JSON.stringify({
          out_trade_no: "XFPRO123",
          transaction_id: "4200000000000000001",
          trade_state: "SUCCESS",
        }), { status: 200 });
      }) as any;

      const payload = await queryWechatOrderByOutTradeNo("XFPRO123");

      assert.equal(payload.trade_state, "SUCCESS");
      assert.equal(payload.transaction_id, "4200000000000000001");
    } finally {
      globalThis.fetch = originalFetch;
      restoreWechatEnv(oldEnv);
    }
  });

  it("does not leak missing key file paths when real mini-program checkout is unavailable", async () => {
    const oldEnv = {
      nodeEnv: process.env.NODE_ENV,
      enableMock: process.env.BILLING_ENABLE_MOCK_PAY,
      disableMock: process.env.BILLING_DISABLE_MOCK_PAY,
      mchId: process.env.WECHAT_PAY_MCH_ID,
      appId: process.env.WECHAT_PAY_APP_ID,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    };
    try {
      process.env.NODE_ENV = "development";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      process.env.BILLING_DISABLE_MOCK_PAY = "true";
      process.env.WECHAT_PAY_MCH_ID = "1900000001";
      process.env.WECHAT_PAY_APP_ID = "wx-mini-app";
      process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
      process.env.WECHAT_PAY_SERIAL_NO = "serial-no";
      delete process.env.WECHAT_PAY_PRIVATE_KEY;
      process.env.WECHAT_PAY_PRIVATE_KEY_PATH = "/tmp/xianfeng-missing-apiclient-key.pem";

      await assert.rejects(
        () => createWechatMiniProgramCheckout({ _id: "order-1" } as any, "openid-1"),
        (error: any) => {
          assert.match(String(error?.message || ""), /微信支付未配置/);
          assert.doesNotMatch(String(error?.message || ""), /xianfeng-missing-apiclient-key|ENOENT|\/tmp\//);
          return true;
        }
      );
    } finally {
      restoreWechatEnv(oldEnv);
    }
  });
});

function restoreWechatEnv(values: Record<string, string | undefined>) {
  const mapping: Record<string, string | undefined> = {
    NODE_ENV: values.nodeEnv,
    BILLING_ENABLE_MOCK_PAY: values.enableMock,
    BILLING_DISABLE_MOCK_PAY: values.disableMock,
    WECHAT_PAY_GATEWAY: values.gateway,
    WECHAT_PAY_MCH_ID: values.mchId,
    WECHAT_PAY_APP_ID: values.appId,
    WECHAT_MINI_APP_ID: values.miniAppId,
    WECHAT_PAY_API_V3_KEY: values.apiV3Key,
    WECHAT_PAY_SERIAL_NO: values.serialNo,
    WECHAT_PAY_PRIVATE_KEY: values.privateKey,
    WECHAT_PAY_PRIVATE_KEY_PATH: values.privateKeyPath,
  };
  for (const [key, value] of Object.entries(mapping)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
