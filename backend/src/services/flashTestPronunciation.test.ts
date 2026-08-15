import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY,
  DEFAULT_ENGLISH_PRONUNCIATION_ASSET_DIRECTORY,
  getChinesePronunciationAssetPath,
  getEnglishPronunciationAssetPath,
  readStaticChinesePronunciation,
  readStaticEnglishPronunciation,
  synthesizeStaticChinesePronunciation,
} from "./flashTestPronunciation";
import { CHARACTER_RECOGNITION_BANK } from "../routes/characterRecognitionBank";

describe("flash test pronunciation", () => {
  it("joins TTS 2.0 audio chunks for static generation", async () => {
    let requestHeaders: Headers;
    let requestBody: any;
    const result = await synthesizeStaticChinesePronunciation("字", {
      apiKey: "generation-key",
      fetchImpl: async (_url, init) => {
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body || "{}"));
        return new Response([
          JSON.stringify({ code: 0, message: "OK", data: "bXA=" }),
          JSON.stringify({ code: 0, message: "OK", data: "Mw==" }),
          JSON.stringify({ code: 20000000, message: "OK", data: "" }),
        ].join("\n"), { status: 200 });
      },
    });

    assert.equal(requestHeaders!.get("X-Api-Key"), "generation-key");
    assert.equal(requestHeaders!.get("X-Api-Resource-Id"), "seed-tts-2.0");
    assert.equal(requestBody.req_params.text, "字");
    assert.equal(requestBody.req_params.speaker, "zh_female_vv_uranus_bigtts");
    assert.equal(requestBody.req_params.audio_params.format, "mp3");
    assert.deepEqual(result, {
      audioBase64: "bXAz",
      mimeType: "audio/mpeg",
      voiceType: "zh_female_vv_uranus_bigtts",
    });
  });

  it("reads a generated Chinese MP3 without calling TTS", async () => {
    const assetDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xianfeng-pronunciation-"));
    try {
      const assetPath = getChinesePronunciationAssetPath("字", { assetDirectory });
      await fs.writeFile(assetPath, Buffer.from("mp3"));

      const result = await readStaticChinesePronunciation("字", { assetDirectory });

      assert.deepEqual(result, {
        audioBase64: "bXAz",
        mimeType: "audio/mpeg",
        voiceType: "static-zh-cn-r1",
      });
    } finally {
      await fs.rm(assetDirectory, { recursive: true, force: true });
    }
  });

  it("reports a missing generated Chinese MP3 clearly", async () => {
    const assetDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xianfeng-pronunciation-"));
    try {
      await assert.rejects(
        readStaticChinesePronunciation("字", { assetDirectory }),
        /静态资源尚未生成/
      );
    } finally {
      await fs.rm(assetDirectory, { recursive: true, force: true });
    }
  });

  it("reads a generated English MP3 without calling TTS", async () => {
    const assetDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xianfeng-pronunciation-"));
    try {
      const assetPath = getEnglishPronunciationAssetPath("cat", { assetDirectory });
      await fs.writeFile(assetPath, Buffer.from("mp3"));

      const result = await readStaticEnglishPronunciation("cat", { assetDirectory });

      assert.deepEqual(result, {
        audioBase64: "bXAz",
        mimeType: "audio/mpeg",
        voiceType: "static-en-gb-r5",
      });
    } finally {
      await fs.rm(assetDirectory, { recursive: true, force: true });
    }
  });

  it("reports a missing generated English MP3 clearly", async () => {
    const assetDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xianfeng-pronunciation-"));
    try {
      await assert.rejects(
        readStaticEnglishPronunciation("cat", { assetDirectory }),
        /英文单词读音静态资源尚未生成/
      );
    } finally {
      await fs.rm(assetDirectory, { recursive: true, force: true });
    }
  });

  it("ships one manifest-verified MP3 for every fixed-bank character", async () => {
    const expectedLines = [];
    for (const character of CHARACTER_RECOGNITION_BANK) {
      const filePath = getChinesePronunciationAssetPath(character);
      const audio = await fs.readFile(filePath);
      assert.ok(audio.length > 4_000, `${character} pronunciation is unexpectedly small`);
      expectedLines.push(
        `${createHash("sha256").update(audio).digest("hex")}  ${path.basename(filePath)}`
      );
    }
    const manifest = await fs.readFile(
      path.join(DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY, "SHA256-r1.txt"),
      "utf8"
    );

    assert.equal(CHARACTER_RECOGNITION_BANK.length, 1_600);
    assert.equal(manifest, `${expectedLines.join("\n")}\n`);
  });

  it("ships the manifest-verified English MP3 set", async () => {
    const manifest = await fs.readFile(
      path.join(DEFAULT_ENGLISH_PRONUNCIATION_ASSET_DIRECTORY, "SHA256-r5.txt"),
      "utf8"
    );
    const manifestLines = manifest.trim().split("\n");
    for (const line of manifestLines) {
      const [hash, filename] = line.trim().split(/\s+/, 2);
      const audio = await fs.readFile(
        path.join(DEFAULT_ENGLISH_PRONUNCIATION_ASSET_DIRECTORY, filename)
      );
      assert.equal(createHash("sha256").update(audio).digest("hex"), hash);
    }

    assert.equal(manifestLines.length, 150);
  });
});
