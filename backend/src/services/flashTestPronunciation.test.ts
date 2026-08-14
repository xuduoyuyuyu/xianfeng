import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { synthesizeFlashTestPronunciation } from "./flashTestPronunciation";

describe("flash test pronunciation", () => {
  it("requests a short MP3 without any ASR payload", async () => {
    let requestBody: any;
    const result = await synthesizeFlashTestPronunciation("cat", "en-US", "user-1", {
      appId: "app-id",
      accessToken: "access-token",
      voiceType: "english-teacher",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ code: 3000, message: "Success", data: "bXAz" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    assert.equal(requestBody.request.text, "cat");
    assert.equal(requestBody.request.operation, "query");
    assert.equal(requestBody.audio.encoding, "mp3");
    assert.equal(requestBody.audio.voice_type, "english-teacher");
    assert.equal("audio" in requestBody.request, false);
    assert.deepEqual(result, { audioBase64: "bXAz", mimeType: "audio/mpeg", voiceType: "english-teacher" });
  });

  it("reports an unopened Volcengine TTS resource clearly", async () => {
    await assert.rejects(
      synthesizeFlashTestPronunciation("字", "zh-CN", "user-1", {
        appId: "app-id",
        accessToken: "access-token",
        fetchImpl: async () => new Response(JSON.stringify({
          code: 3001,
          message: "[resource_id=volc.tts.default] requested resource not granted",
        }), { status: 403, headers: { "Content-Type": "application/json" } }),
      }),
      /语音合成资源尚未开通/
    );
  });
});
