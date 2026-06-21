import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAuthenticateWithMobileInvite } from "./user";

describe("mobile invite gate", () => {
  it("allows existing mobile users without an invite when the gate is configured", () => {
    assert.equal(
      canAuthenticateWithMobileInvite({
        existingUser: { _id: "user-1" },
        configuredInviteCode: "release-2026",
        submittedInviteCode: "",
      }),
      true
    );
  });

  it("requires a matching invite for new mobile users when the gate is configured", () => {
    assert.equal(
      canAuthenticateWithMobileInvite({
        existingUser: null,
        configuredInviteCode: "release-2026",
        submittedInviteCode: "",
      }),
      false
    );
    assert.equal(
      canAuthenticateWithMobileInvite({
        existingUser: null,
        configuredInviteCode: "release-2026",
        submittedInviteCode: "release-2026",
      }),
      true
    );
  });

  it("keeps registration open when no invite is configured", () => {
    assert.equal(
      canAuthenticateWithMobileInvite({
        existingUser: null,
        configuredInviteCode: "",
        submittedInviteCode: "",
      }),
      true
    );
  });
});
