import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_ENGLISH_WORD_PACK_ID,
  ENGLISH_PICTURE_NAMING_BANK,
  ENGLISH_PICTURE_NAMING_VERSION,
  ENGLISH_WORD_PACKS,
  buildEnglishPictureNamingSummary,
  getEnglishWordPack
} = require("./englishPictureNaming.js");

test("english word inventory includes the collected 150 words in five independent packs", () => {
  assert.equal(ENGLISH_PICTURE_NAMING_VERSION, "2026-08-14-prea1-packs-r4");
  assert.equal(DEFAULT_ENGLISH_WORD_PACK_ID, "animals");
  assert.deepEqual(ENGLISH_WORD_PACKS.map((pack) => pack.id), [
    "animals",
    "food",
    "home-school",
    "body-clothing",
    "transport-nature"
  ]);
  assert.equal(ENGLISH_WORD_PACKS.every((pack) => pack.items.length === 30), true);
  const items = ENGLISH_WORD_PACKS.flatMap((pack) => pack.items);
  assert.equal(items.length, 150);
  assert.equal(new Set(items.map((item) => item.id)).size, 150);
  assert.equal(new Set(items.map((item) => item.word)).size, 150);
  assert.deepEqual(
    items.map((item) => item.word),
    [
      "cat", "dog", "bird", "fish", "duck", "horse", "cow", "sheep", "elephant", "monkey", "rabbit", "pig", "lion", "tiger", "bear",
      "mouse", "frog", "turtle", "snake", "giraffe", "zebra", "panda", "kangaroo", "deer", "goat", "bee", "butterfly", "ant", "crab", "dolphin",
      "apple", "banana", "orange", "egg", "bread", "cake", "carrot", "tomato", "potato", "rice", "milk", "water", "juice", "cheese", "chicken",
      "strawberry", "grape", "watermelon", "pear", "cherry", "lemon", "corn", "onion", "mushroom", "noodle", "soup", "cookie", "candy", "pizza", "hamburger",
      "book", "pencil", "ruler", "chair", "table", "bed", "door", "window", "clock", "bag", "pen", "desk", "cup", "lamp", "box",
      "eraser", "notebook", "calculator", "scissors", "glue", "computer", "phone", "television", "fridge", "spoon", "fork", "plate", "bowl", "key", "umbrella",
      "hand", "foot", "eye", "ear", "nose", "mouth", "hair", "hat", "shoe", "shirt", "arm", "leg", "face", "coat", "dress",
      "socks", "brooch", "button", "wallet", "zipper", "gloves", "glasses", "ribbon", "cap", "boots", "belt", "comb", "watch", "ring", "pendant",
      "car", "bus", "train", "bike", "boat", "plane", "truck", "sun", "tree", "flower", "taxi", "ship", "moon", "cloud", "rain",
      "road", "bridge", "van", "helicopter", "motorcycle", "subway", "mountain", "river", "lake", "sea", "grass", "forest", "snow", "rainbow", "rock"
    ]
  );
});

test("every collected word exposes one local real-photo asset", () => {
  assert.equal(getEnglishWordPack("missing").id, DEFAULT_ENGLISH_WORD_PACK_ID);
  assert.equal(ENGLISH_PICTURE_NAMING_BANK, getEnglishWordPack("animals").items);
  const items = ENGLISH_WORD_PACKS.flatMap((pack) => pack.items);
  assert.equal(items.every((item) => /\.(?:jpg|webp)$/.test(item.image)), true);
  assert.equal(new Set(items.map((item) => item.image)).size, 150);
  assert.equal(ENGLISH_WORD_PACKS.every((pack) => pack.items.every((item) => item.image)), true);
});

test("english word summary keeps recognized, practice, and skipped items separate", () => {
  const summary = buildEnglishPictureNamingSummary([
    { status: "matched" },
    { status: "matched" },
    { status: "unmatched" },
    { status: "skipped" }
  ], 10);
  assert.deepEqual(summary, {
    totalCount: 10,
    matchedCount: 2,
    needsPracticeCount: 1,
    skippedCount: 1
  });
});
