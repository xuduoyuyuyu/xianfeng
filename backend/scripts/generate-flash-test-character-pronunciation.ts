import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { CHARACTER_RECOGNITION_BANK } from "../src/routes/characterRecognitionBank";
import {
  DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY,
  getChinesePronunciationAssetPath,
  synthesizeStaticChinesePronunciation,
} from "../src/services/flashTestPronunciation";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  await fs.mkdir(DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY, { recursive: true });
  let generated = 0;
  let reused = 0;
  let nextIndex = 0;

  async function generateNext() {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= CHARACTER_RECOGNITION_BANK.length) return;
    const character = CHARACTER_RECOGNITION_BANK[index];
    const filePath = getChinesePronunciationAssetPath(character);
    try {
      await fs.access(filePath);
      reused += 1;
      return generateNext();
    } catch {}

    let result;
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await synthesizeStaticChinesePronunciation(character);
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
    const audio = Buffer.from(result.audioBase64, "base64");
    const temporaryPath = `${filePath}.partial`;
    await fs.writeFile(temporaryPath, audio);
    await fs.rename(temporaryPath, filePath);
    generated += 1;
    const completed = generated + reused;
    if (completed % 25 === 0 || completed === CHARACTER_RECOGNITION_BANK.length) {
      console.log(`${completed}/${CHARACTER_RECOGNITION_BANK.length}`);
    }
    return generateNext();
  }

  await Promise.all(Array.from({ length: 5 }, () => generateNext()));

  const manifestLines = [];
  for (const character of CHARACTER_RECOGNITION_BANK) {
    const filePath = getChinesePronunciationAssetPath(character);
    const audio = await fs.readFile(filePath);
    manifestLines.push(
      `${createHash("sha256").update(audio).digest("hex")}  ${path.basename(filePath)}`
    );
  }
  await fs.writeFile(
    path.join(DEFAULT_CHINESE_PRONUNCIATION_ASSET_DIRECTORY, "SHA256-r1.txt"),
    `${manifestLines.join("\n")}\n`
  );
  console.log(`complete generated=${generated} reused=${reused}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
