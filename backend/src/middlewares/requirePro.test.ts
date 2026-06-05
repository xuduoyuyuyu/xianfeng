import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requirePro } from "./requirePro";

describe("requirePro", () => {
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
});
