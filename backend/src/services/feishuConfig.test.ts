import assert from "node:assert/strict";
import test from "node:test";
import { decryptFeishuSecret, encryptFeishuSecret } from "./feishuConfig";

test("Feishu App Secret is encrypted at rest and can be decrypted", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret";
  try {
    const encrypted = encryptFeishuSecret("feishu-secret-value");
    assert.notEqual(encrypted, "feishu-secret-value");
    assert.equal(encrypted.includes("feishu-secret-value"), false);
    assert.equal(decryptFeishuSecret(encrypted), "feishu-secret-value");
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test("Feishu encrypted secret cannot be read with another server key", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "first-key";
  const encrypted = encryptFeishuSecret("secret");
  process.env.JWT_SECRET = "second-key";
  try {
    assert.throws(() => decryptFeishuSecret(encrypted));
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
