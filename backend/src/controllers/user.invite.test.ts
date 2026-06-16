import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAuthenticateWithMobileInvite, canVerifyLoginInvite } from "./user";

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

  it("invalidates the old invite and accepts the new invite while activations remain", () => {
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "Xf260616618KL",
        submittedInviteCode: "Xf2606137KQ9",
        activationLimit: 100,
        usedActivations: 0,
      }),
      false
    );
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "Xf260616618KL",
        submittedInviteCode: "Xf260616618KL",
        activationLimit: 100,
        usedActivations: 99,
      }),
      true
    );
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "Xf260616618KL",
        submittedInviteCode: "Xf260616618KL",
        activationLimit: 100,
        usedActivations: 100,
      }),
      false
    );
  });

  it("does not apply the new-user activation limit to existing mobile users", () => {
    assert.equal(
      canAuthenticateWithMobileInvite({
        existingUser: { _id: "user-1" },
        configuredInviteCode: "Xf260616618KL",
        submittedInviteCode: "",
        activationLimit: 100,
        usedActivations: 100,
      }),
      true
    );
  });

  it("allows open registration when the invite gate is disabled by admin config", () => {
    assert.equal(
      canVerifyLoginInvite({
        enabled: false,
        configuredInviteCode: "release-2026",
        submittedInviteCode: "",
        activationLimit: 0,
      }),
      true
    );
  });

  it("rejects expired or fully exhausted invite codes", () => {
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "release-2026",
        submittedInviteCode: "release-2026",
        expiresAt: "2026-06-16T00:00:00.000Z",
        now: "2026-06-16T00:00:01.000Z",
      }),
      false
    );
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "release-2026",
        submittedInviteCode: "release-2026",
        activationLimit: 0,
        usedActivations: 0,
      }),
      false
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

  it("verifies the configured invite before the mobile flow starts", () => {
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "release-2026",
        submittedInviteCode: "",
      }),
      false
    );
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "release-2026",
        submittedInviteCode: "wrong",
      }),
      false
    );
    assert.equal(
      canVerifyLoginInvite({
        configuredInviteCode: "release-2026",
        submittedInviteCode: "release-2026",
      }),
      true
    );
  });
});
