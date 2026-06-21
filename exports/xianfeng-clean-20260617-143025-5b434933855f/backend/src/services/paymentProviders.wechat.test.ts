import assert from "node:assert/strict";
import crypto from "crypto";
import { describe, it } from "node:test";
import { decryptWechatResource } from "./paymentProviders";

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
});
