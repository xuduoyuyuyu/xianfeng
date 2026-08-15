import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import FlashTestResult, {
  FlashTestDimensionScore,
  FlashTestPictureNamingAnswer,
  FlashTestPictureNamingSummary,
  FlashTestRecognitionSummary,
} from "../models/FlashTestResult";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { resolveProgramAiProvider } from "../services/programAi";
import {
  readStaticChinesePronunciation,
  readStaticEnglishPronunciation,
} from "../services/flashTestPronunciation";
import {
  ADVANCED_CHARACTER_RECOGNITION_BANK,
  BASE_CHARACTER_RECOGNITION_BANK,
  CHARACTER_RECOGNITION_BANK,
} from "./characterRecognitionBank";

const router = Router();

export const EIGHT_TALENTS_VERSION = "2026-08-11";
export const BASE_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r1";
export const LEGACY_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r2";
export const CHARACTER_RECOGNITION_VERSION = "2026-08-13-r3";
export const ENGLISH_PICTURE_NAMING_VERSION = "2026-08-14-prea1-packs-r4";
export const DEFAULT_ENGLISH_WORD_PACK_ID = "animals";
const SUPPORTED_ASSESSMENT_IDS = ["eight-talents", "character-recognition", "english-picture-naming"] as const;

interface EnglishWordItem {
  id: string;
  word: string;
  ipa: string;
}

interface EnglishWordPack {
  id: string;
  items: EnglishWordItem[];
}

export const ENGLISH_WORD_PACKS: EnglishWordPack[] = [
  {
    id: "animals",
    items: [
      { id: "animal-cat", word: "cat", ipa: "/kæt/" },
      { id: "animal-dog", word: "dog", ipa: "/dɒɡ/" },
      { id: "animal-bird", word: "bird", ipa: "/bɜːd/" },
      { id: "animal-fish", word: "fish", ipa: "/fɪʃ/" },
      { id: "animal-duck", word: "duck", ipa: "/dʌk/" },
      { id: "animal-horse", word: "horse", ipa: "/hɔːs/" },
      { id: "animal-cow", word: "cow", ipa: "/kaʊ/" },
      { id: "animal-sheep", word: "sheep", ipa: "/ʃiːp/" },
      { id: "animal-elephant", word: "elephant", ipa: "/ˈelɪfənt/" },
      { id: "animal-monkey", word: "monkey", ipa: "/ˈmʌŋki/" },
      { id: "animal-rabbit", word: "rabbit", ipa: "/ˈræbɪt/" },
      { id: "animal-pig", word: "pig", ipa: "/pɪɡ/" },
      { id: "animal-lion", word: "lion", ipa: "/ˈlaɪən/" },
      { id: "animal-tiger", word: "tiger", ipa: "/ˈtaɪɡə/" },
      { id: "animal-bear", word: "bear", ipa: "/beə/" },
      { id: "animal-mouse", word: "mouse", ipa: "/maʊs/" },
      { id: "animal-frog", word: "frog", ipa: "/frɒɡ/" },
      { id: "animal-turtle", word: "turtle", ipa: "/ˈtɜːtəl/" },
      { id: "animal-snake", word: "snake", ipa: "/sneɪk/" },
      { id: "animal-giraffe", word: "giraffe", ipa: "/dʒəˈrɑːf/" },
      { id: "animal-zebra", word: "zebra", ipa: "/ˈzebrə/" },
      { id: "animal-panda", word: "panda", ipa: "/ˈpændə/" },
      { id: "animal-kangaroo", word: "kangaroo", ipa: "/ˌkæŋɡəˈruː/" },
      { id: "animal-deer", word: "deer", ipa: "/dɪə/" },
      { id: "animal-goat", word: "goat", ipa: "/ɡəʊt/" },
      { id: "animal-bee", word: "bee", ipa: "/biː/" },
      { id: "animal-butterfly", word: "butterfly", ipa: "/ˈbʌtəflaɪ/" },
      { id: "animal-ant", word: "ant", ipa: "/ænt/" },
      { id: "animal-crab", word: "crab", ipa: "/kræb/" },
      { id: "animal-dolphin", word: "dolphin", ipa: "/ˈdɒlfɪn/" },
    ],
  },
  {
    id: "food",
    items: [
      { id: "food-apple", word: "apple", ipa: "/ˈæpəl/" },
      { id: "food-banana", word: "banana", ipa: "/bəˈnɑːnə/" },
      { id: "food-orange", word: "orange", ipa: "/ˈɒrɪndʒ/" },
      { id: "food-egg", word: "egg", ipa: "/eɡ/" },
      { id: "food-bread", word: "bread", ipa: "/bred/" },
      { id: "food-cake", word: "cake", ipa: "/keɪk/" },
      { id: "food-carrot", word: "carrot", ipa: "/ˈkærət/" },
      { id: "food-tomato", word: "tomato", ipa: "/təˈmɑːtəʊ/" },
      { id: "food-potato", word: "potato", ipa: "/pəˈteɪtəʊ/" },
      { id: "food-rice", word: "rice", ipa: "/raɪs/" },
      { id: "food-milk", word: "milk", ipa: "/mɪlk/" },
      { id: "food-water", word: "water", ipa: "/ˈwɔːtə/" },
      { id: "food-juice", word: "juice", ipa: "/dʒuːs/" },
      { id: "food-cheese", word: "cheese", ipa: "/tʃiːz/" },
      { id: "food-chicken", word: "chicken", ipa: "/ˈtʃɪkɪn/" },
      { id: "food-strawberry", word: "strawberry", ipa: "/ˈstrɔːbəri/" },
      { id: "food-grape", word: "grape", ipa: "/ɡreɪp/" },
      { id: "food-watermelon", word: "watermelon", ipa: "/ˈwɔːtəmelən/" },
      { id: "food-pear", word: "pear", ipa: "/peə/" },
      { id: "food-cherry", word: "cherry", ipa: "/ˈtʃeri/" },
      { id: "food-lemon", word: "lemon", ipa: "/ˈlemən/" },
      { id: "food-corn", word: "corn", ipa: "/kɔːn/" },
      { id: "food-onion", word: "onion", ipa: "/ˈʌnjən/" },
      { id: "food-mushroom", word: "mushroom", ipa: "/ˈmʌʃruːm/" },
      { id: "food-noodle", word: "noodle", ipa: "/ˈnuːdəl/" },
      { id: "food-soup", word: "soup", ipa: "/suːp/" },
      { id: "food-cookie", word: "cookie", ipa: "/ˈkʊki/" },
      { id: "food-candy", word: "candy", ipa: "/ˈkændi/" },
      { id: "food-pizza", word: "pizza", ipa: "/ˈpiːtsə/" },
      { id: "food-hamburger", word: "hamburger", ipa: "/ˈhæmbɜːɡə/" },
    ],
  },
  {
    id: "home-school",
    items: [
      { id: "home-book", word: "book", ipa: "/bʊk/" },
      { id: "home-pencil", word: "pencil", ipa: "/ˈpensəl/" },
      { id: "home-ruler", word: "ruler", ipa: "/ˈruːlə/" },
      { id: "home-chair", word: "chair", ipa: "/tʃeə/" },
      { id: "home-table", word: "table", ipa: "/ˈteɪbəl/" },
      { id: "home-bed", word: "bed", ipa: "/bed/" },
      { id: "home-door", word: "door", ipa: "/dɔː/" },
      { id: "home-window", word: "window", ipa: "/ˈwɪndəʊ/" },
      { id: "home-clock", word: "clock", ipa: "/klɒk/" },
      { id: "home-bag", word: "bag", ipa: "/bæɡ/" },
      { id: "home-pen", word: "pen", ipa: "/pen/" },
      { id: "home-desk", word: "desk", ipa: "/desk/" },
      { id: "home-cup", word: "cup", ipa: "/kʌp/" },
      { id: "home-lamp", word: "lamp", ipa: "/læmp/" },
      { id: "home-box", word: "box", ipa: "/bɒks/" },
      { id: "home-eraser", word: "eraser", ipa: "/ɪˈreɪzə/" },
      { id: "home-notebook", word: "notebook", ipa: "/ˈnəʊtbʊk/" },
      { id: "home-calculator", word: "calculator", ipa: "/ˈkælkjəleɪtə/" },
      { id: "home-scissors", word: "scissors", ipa: "/ˈsɪzəz/" },
      { id: "home-glue", word: "glue", ipa: "/ɡluː/" },
      { id: "home-computer", word: "computer", ipa: "/kəmˈpjuːtə/" },
      { id: "home-phone", word: "phone", ipa: "/fəʊn/" },
      { id: "home-television", word: "television", ipa: "/ˈtelɪvɪʒən/" },
      { id: "home-fridge", word: "fridge", ipa: "/frɪdʒ/" },
      { id: "home-spoon", word: "spoon", ipa: "/spuːn/" },
      { id: "home-fork", word: "fork", ipa: "/fɔːk/" },
      { id: "home-plate", word: "plate", ipa: "/pleɪt/" },
      { id: "home-bowl", word: "bowl", ipa: "/bəʊl/" },
      { id: "home-key", word: "key", ipa: "/kiː/" },
      { id: "home-umbrella", word: "umbrella", ipa: "/ʌmˈbrelə/" },
    ],
  },
  {
    id: "body-clothing",
    items: [
      { id: "body-hand", word: "hand", ipa: "/hænd/" },
      { id: "body-foot", word: "foot", ipa: "/fʊt/" },
      { id: "body-eye", word: "eye", ipa: "/aɪ/" },
      { id: "body-ear", word: "ear", ipa: "/ɪə/" },
      { id: "body-nose", word: "nose", ipa: "/nəʊz/" },
      { id: "body-mouth", word: "mouth", ipa: "/maʊθ/" },
      { id: "body-hair", word: "hair", ipa: "/heə/" },
      { id: "body-hat", word: "hat", ipa: "/hæt/" },
      { id: "body-shoe", word: "shoe", ipa: "/ʃuː/" },
      { id: "body-shirt", word: "shirt", ipa: "/ʃɜːt/" },
      { id: "body-arm", word: "arm", ipa: "/ɑːm/" },
      { id: "body-leg", word: "leg", ipa: "/leɡ/" },
      { id: "body-face", word: "face", ipa: "/feɪs/" },
      { id: "body-coat", word: "coat", ipa: "/kəʊt/" },
      { id: "body-dress", word: "dress", ipa: "/dres/" },
      { id: "body-socks", word: "socks", ipa: "/sɒks/" },
      { id: "body-brooch", word: "brooch", ipa: "/brəʊtʃ/" },
      { id: "body-button", word: "button", ipa: "/ˈbʌtən/" },
      { id: "body-wallet", word: "wallet", ipa: "/ˈwɒlɪt/" },
      { id: "body-zipper", word: "zipper", ipa: "/ˈzɪpə/" },
      { id: "body-gloves", word: "gloves", ipa: "/ɡlʌvz/" },
      { id: "body-glasses", word: "glasses", ipa: "/ˈɡlɑːsɪz/" },
      { id: "body-ribbon", word: "ribbon", ipa: "/ˈrɪbən/" },
      { id: "body-cap", word: "cap", ipa: "/kæp/" },
      { id: "body-boots", word: "boots", ipa: "/buːts/" },
      { id: "body-belt", word: "belt", ipa: "/belt/" },
      { id: "body-comb", word: "comb", ipa: "/kəʊm/" },
      { id: "body-watch", word: "watch", ipa: "/wɒtʃ/" },
      { id: "body-ring", word: "ring", ipa: "/rɪŋ/" },
      { id: "body-pendant", word: "pendant", ipa: "/ˈpendənt/" },
    ],
  },
  {
    id: "transport-nature",
    items: [
      { id: "world-car", word: "car", ipa: "/kɑː/" },
      { id: "world-bus", word: "bus", ipa: "/bʌs/" },
      { id: "world-train", word: "train", ipa: "/treɪn/" },
      { id: "world-bike", word: "bike", ipa: "/baɪk/" },
      { id: "world-boat", word: "boat", ipa: "/bəʊt/" },
      { id: "world-plane", word: "plane", ipa: "/pleɪn/" },
      { id: "world-truck", word: "truck", ipa: "/trʌk/" },
      { id: "world-sun", word: "sun", ipa: "/sʌn/" },
      { id: "world-tree", word: "tree", ipa: "/triː/" },
      { id: "world-flower", word: "flower", ipa: "/ˈflaʊə/" },
      { id: "world-taxi", word: "taxi", ipa: "/ˈtæksi/" },
      { id: "world-ship", word: "ship", ipa: "/ʃɪp/" },
      { id: "world-moon", word: "moon", ipa: "/muːn/" },
      { id: "world-cloud", word: "cloud", ipa: "/klaʊd/" },
      { id: "world-rain", word: "rain", ipa: "/reɪn/" },
      { id: "world-road", word: "road", ipa: "/rəʊd/" },
      { id: "world-bridge", word: "bridge", ipa: "/brɪdʒ/" },
      { id: "world-van", word: "van", ipa: "/væn/" },
      { id: "world-helicopter", word: "helicopter", ipa: "/ˈhelɪkɒptə/" },
      { id: "world-motorcycle", word: "motorcycle", ipa: "/ˈməʊtəsaɪkəl/" },
      { id: "world-subway", word: "subway", ipa: "/ˈsʌbweɪ/" },
      { id: "world-mountain", word: "mountain", ipa: "/ˈmaʊntɪn/" },
      { id: "world-river", word: "river", ipa: "/ˈrɪvə/" },
      { id: "world-lake", word: "lake", ipa: "/leɪk/" },
      { id: "world-sea", word: "sea", ipa: "/siː/" },
      { id: "world-grass", word: "grass", ipa: "/ɡrɑːs/" },
      { id: "world-forest", word: "forest", ipa: "/ˈfɒrɪst/" },
      { id: "world-snow", word: "snow", ipa: "/snəʊ/" },
      { id: "world-rainbow", word: "rainbow", ipa: "/ˈreɪnbəʊ/" },
      { id: "world-rock", word: "rock", ipa: "/rɒk/" },
    ],
  },
];

const ENGLISH_WORD_PACK_IDS = ENGLISH_WORD_PACKS.map((pack) => pack.id);
const ALL_ENGLISH_WORD_ITEMS = ENGLISH_WORD_PACKS.flatMap((pack) => pack.items);

function getEnglishWordPack(packId: string) {
  return ENGLISH_WORD_PACKS.find((pack) => pack.id === packId)
    || ENGLISH_WORD_PACKS.find((pack) => pack.id === DEFAULT_ENGLISH_WORD_PACK_ID)!;
}

const pictureNamingAudioDir = path.join(process.cwd(), "uploads", "flash-test-audio");
if (!fs.existsSync(pictureNamingAudioDir)) fs.mkdirSync(pictureNamingAudioDir, { recursive: true });
const pictureNamingAudioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, pictureNamingAudioDir),
    filename: (_req, file, callback) => {
      const ext = (path.extname(file.originalname) || ".mp3").toLowerCase();
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") {
      callback(null, true);
      return;
    }
    callback(new Error("仅支持音频文件"));
  },
});

const DIMENSIONS = [
  { code: "M", name: "记忆" },
  { code: "Y", name: "推演" },
  { code: "B", name: "表达" },
  { code: "G", name: "感知" },
  { code: "S", name: "数理" },
  { code: "C", name: "操作" },
  { code: "K", name: "狂热" },
  { code: "Z", name: "创造" },
];

function levelForTotal(total: number) {
  if (total >= 20) return "顶级核心天赋";
  if (total >= 15) return "优势可发展能力";
  if (total >= 10) return "普通中等能力";
  return "弱势短板能力";
}

export function normalizeAnswers(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 40) return null;
  const answers = value.map(Number);
  if (answers.some((answer) => !Number.isInteger(answer) || answer < 1 || answer > 5)) return null;
  return answers;
}

export function normalizeCharacterRecognitionAnswers(value: unknown): number[] | null {
  if (!Array.isArray(value) || ![800, CHARACTER_RECOGNITION_BANK.length].includes(value.length)) return null;
  const answers = value.map(Number);
  if (answers.some((answer) => answer !== 0 && answer !== 1)) return null;
  return answers;
}

export function normalizeCharacterRecognitionSample(value: unknown, recognitionGroup = 1): string[] | null {
  if (!Array.isArray(value) || ![800, CHARACTER_RECOGNITION_BANK.length].includes(value.length)) return null;
  const characters = value.map((character) => String(character || ""));
  const expectedBank = characters.length === CHARACTER_RECOGNITION_BANK.length
    ? CHARACTER_RECOGNITION_BANK
    : Number(recognitionGroup) === 2
      ? ADVANCED_CHARACTER_RECOGNITION_BANK
      : BASE_CHARACTER_RECOGNITION_BANK;
  const matchesBank = characters.every((character, index) => character === expectedBank[index]);
  return matchesBank ? characters : null;
}

export function scoreCharacterRecognition(
  answers: number[],
  recognitionGroup = 1
): FlashTestRecognitionSummary {
  const recognizedCount = answers.reduce((sum, answer) => sum + answer, 0);
  const sampledCount = answers.length;
  return {
    recognizedCount,
    sampledCount,
    cumulativeRecognizedCount: recognizedCount,
    cumulativeSampledCount: sampledCount,
    completedRounds: sampledCount === CHARACTER_RECOGNITION_BANK.length ? 2 : 1,
    estimatedMin: recognizedCount,
    estimatedMax: recognizedCount,
    estimateLabel: String(recognizedCount),
    reference: sampledCount === 1600
      ? "旧版累计 1600 字逐字筛选结果"
      : `第 ${Number(recognitionGroup) === 2 ? 2 : 1} 组 800 字逐字筛选结果`,
  };
}

export function scoreEightTalents(answers: number[]): FlashTestDimensionScore[] {
  return DIMENSIONS.map((dimension, index) => {
    const total = answers.slice(index * 5, index * 5 + 5).reduce((sum, answer) => sum + answer, 0);
    return {
      ...dimension,
      total,
      radarValue: Math.round(total / 5),
      level: levelForTotal(total),
    };
  });
}

export function normalizeSpokenEnglish(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesEnglishPictureWord(recognizedText: unknown, targetWord: string): boolean {
  const normalized = normalizeSpokenEnglish(recognizedText);
  if (!normalized) return false;
  return normalized.split(/[\s'-]+/).includes(targetWord);
}

export function normalizePictureNamingAnswers(
  value: unknown,
  englishPromptMode: "picture" | "word" = "picture",
  englishWordPackId = DEFAULT_ENGLISH_WORD_PACK_ID
): FlashTestPictureNamingAnswer[] | null {
  const bank = getEnglishWordPack(englishWordPackId).items;
  if (!Array.isArray(value) || value.length !== bank.length) return null;
  const normalized = value.map((raw, index) => {
    const expected = bank[index];
    const itemId = String(raw?.itemId || "");
    const requestedStatus = String(raw?.status || "");
    const recognizedText = String(raw?.recognizedText || "").trim().slice(0, 120);
    if (itemId !== expected.id || !["matched", "unmatched", "skipped"].includes(requestedStatus)) return null;
    const status = englishPromptMode === "word"
      ? requestedStatus === "matched" ? "matched" : "skipped"
      : requestedStatus === "skipped"
        ? "skipped"
        : matchesEnglishPictureWord(recognizedText, expected.word) ? "matched" : "unmatched";
    return { itemId, targetWord: expected.word, recognizedText, status } as FlashTestPictureNamingAnswer;
  });
  return normalized.some((item) => !item) ? null : normalized as FlashTestPictureNamingAnswer[];
}

export function scorePictureNaming(answers: FlashTestPictureNamingAnswer[]): FlashTestPictureNamingSummary {
  return {
    totalCount: answers.length,
    matchedCount: answers.filter((item) => item.status === "matched").length,
    needsPracticeCount: answers.filter((item) => item.status === "unmatched").length,
    skippedCount: answers.filter((item) => item.status === "skipped").length,
  };
}

function serializeResult(result: any) {
  return {
    id: String(result._id),
    assessmentId: result.assessmentId,
    assessmentVersion: result.assessmentVersion,
    mode: result.mode,
    childId: result.childId || "",
    childName: result.childName || "",
    scores: result.scores,
    recognitionSummary: result.recognitionSummary,
    recognitionGroup: Number(result.recognitionGroup) === 2 || result.sampleCharacters?.length === 1600 ? 2 : 1,
    answers: result.assessmentId === "character-recognition" ? result.answers : undefined,
    sampleCharacters: result.assessmentId === "character-recognition" ? result.sampleCharacters : undefined,
    pictureNamingAnswers: result.assessmentId === "english-picture-naming" ? result.pictureNamingAnswers : undefined,
    pictureNamingSummary: result.assessmentId === "english-picture-naming" ? result.pictureNamingSummary : undefined,
    englishPromptMode: result.assessmentId === "english-picture-naming" ? result.englishPromptMode || "picture" : undefined,
    englishWordPackId: result.assessmentId === "english-picture-naming" ? result.englishWordPackId || DEFAULT_ENGLISH_WORD_PACK_ID : undefined,
    completedAt: result.completedAt,
  };
}

function serializeRecognitionGroupMastery(result: any, recognitionGroup: 1 | 2) {
  if (!result) return null;
  const answers = Array.isArray(result.answers) ? result.answers.map(Number) : [];
  const groupAnswers = answers.length === CHARACTER_RECOGNITION_BANK.length
    ? answers.slice((recognitionGroup - 1) * 800, recognitionGroup * 800)
    : answers;
  if (groupAnswers.length !== 800) return null;
  return {
    resultId: String(result._id),
    recognitionGroup,
    recognizedCount: groupAnswers.reduce((sum: number, answer: number) => sum + answer, 0),
    sampledCount: 800,
    completedAt: result.completedAt,
  };
}

function latestRecognitionGroupMastery(independentResult: any, legacyResult: any, recognitionGroup: 1 | 2) {
  if (!independentResult) return serializeRecognitionGroupMastery(legacyResult, recognitionGroup);
  if (!legacyResult) return serializeRecognitionGroupMastery(independentResult, recognitionGroup);
  const independentTime = new Date(independentResult.completedAt).getTime();
  const legacyTime = new Date(legacyResult.completedAt).getTime();
  return serializeRecognitionGroupMastery(
    independentTime >= legacyTime ? independentResult : legacyResult,
    recognitionGroup
  );
}

function serializeEnglishWordPackMastery(result: any, englishWordPackId: string) {
  const summary = result && result.pictureNamingSummary;
  if (!summary || Number(summary.totalCount) !== getEnglishWordPack(englishWordPackId).items.length) return null;
  return {
    resultId: String(result._id),
    englishWordPackId,
    matchedCount: Number(summary.matchedCount) || 0,
    totalCount: Number(summary.totalCount) || 0,
    completedAt: result.completedAt,
  };
}

router.post("/english-picture-naming/recognize", authenticate, (req, res, next) => {
  pictureNamingAudioUpload.single("audio")(req, res, (error: any) => {
    if (!error) {
      next();
      return;
    }
    res.status(400).json({ message: error?.code === "LIMIT_FILE_SIZE" ? "录音过长，请控制在 4 秒内" : error?.message || "录音上传失败" });
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  try {
    const itemId = String(req.body?.itemId || "");
    const item = ALL_ENGLISH_WORD_ITEMS.find((candidate) => candidate.id === itemId);
    if (!item) {
      res.status(400).json({ message: "图片题目无效，请重新开始" });
      return;
    }
    if (!file) {
      res.status(400).json({ message: "没有收到录音，请重试" });
      return;
    }
    const transcription = await resolveProgramAiProvider().transcribeAudio(file.path);
    const recognizedText = String(transcription.plainText || "").trim().slice(0, 120);
    const matched = matchesEnglishPictureWord(recognizedText, item.word);
    res.json({
      itemId: item.id,
      targetWord: item.word,
      ipa: item.ipa,
      recognizedText,
      matched,
      status: matched ? "matched" : "unmatched",
      feedback: matched ? "识别与目标词吻合" : "未稳定识别为目标词，可对照音标再试一次",
      calibrationNote: "这是 ASR 识别校准，不是音素级口音评分",
    });
  } catch (error: any) {
    res.status(502).json({ message: error?.message || "语音识别失败，请重试" });
  } finally {
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
  }
});

router.post("/pronunciation", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kind = String(req.body?.kind || "");
    let text = "";
    let language: "zh-CN" | "en-US";
    if (kind === "english-word") {
      const itemId = String(req.body?.itemId || "");
      const item = ALL_ENGLISH_WORD_ITEMS.find((candidate) => candidate.id === itemId);
      if (!item) {
        res.status(400).json({ message: "英文单词无效，请重新开始" });
        return;
      }
      text = item.word;
      language = "en-US";
    } else if (kind === "chinese-character") {
      const character = String(req.body?.character || "");
      if (!CHARACTER_RECOGNITION_BANK.includes(character as any)) {
        res.status(400).json({ message: "识字题目无效，请重新开始" });
        return;
      }
      text = character;
      language = "zh-CN";
    } else {
      res.status(400).json({ message: "读音类型无效" });
      return;
    }

    const audio = kind === "chinese-character"
      ? await readStaticChinesePronunciation(text)
      : await readStaticEnglishPronunciation(text);
    res.json({ text, language, ...audio });
  } catch (error: any) {
    const message = String(error?.message || "读音生成失败，请重试");
    res.status(/尚未开通|未配置|尚未生成/.test(message) ? 503 : 502).json({ message });
  }
});

router.post("/results", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || "");
    const assessmentId = String(req.body?.assessmentId || "");
    const assessmentVersion = String(req.body?.assessmentVersion || "");
    const mode = String(req.body?.mode || "");
    const childId = String(req.body?.childId || "").trim();
    const requestedRecognitionGroup = Number(req.body?.recognitionGroup);
    const recognitionGroup = requestedRecognitionGroup === 2 ? 2 : 1;
    const requestedEnglishPromptMode = String(req.body?.englishPromptMode || "picture");
    const englishPromptMode = assessmentId === "english-picture-naming" ? requestedEnglishPromptMode : undefined;
    const requestedEnglishWordPackId = String(req.body?.englishWordPackId || DEFAULT_ENGLISH_WORD_PACK_ID);
    const englishWordPackId = assessmentId === "english-picture-naming" ? requestedEnglishWordPackId : undefined;
    const answers = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionAnswers(req.body?.answers)
      : assessmentId === "english-picture-naming" ? [] : normalizeAnswers(req.body?.answers);
    const pictureNamingAnswers = assessmentId === "english-picture-naming"
      ? normalizePictureNamingAnswers(
        req.body?.pictureNamingAnswers,
        englishPromptMode as "picture" | "word",
        requestedEnglishWordPackId
      )
      : undefined;
    const sampleCharacters = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionSample(req.body?.sampleCharacters, recognitionGroup)
      : [];

    if (!SUPPORTED_ASSESSMENT_IDS.includes(assessmentId as any)) {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    const expectedVersion = assessmentId === "character-recognition"
      ? (Array.isArray(answers) && answers.length === 1600
        ? LEGACY_CHARACTER_RECOGNITION_VERSION
        : requestedRecognitionGroup === 1 || requestedRecognitionGroup === 2
          ? CHARACTER_RECOGNITION_VERSION
          : BASE_CHARACTER_RECOGNITION_VERSION)
      : assessmentId === "english-picture-naming" ? ENGLISH_PICTURE_NAMING_VERSION : EIGHT_TALENTS_VERSION;
    if (assessmentVersion !== expectedVersion) {
      res.status(400).json({ message: "测试题目版本已更新，请重新开始" });
      return;
    }
    if (assessmentId === "english-picture-naming" && !["picture", "word"].includes(requestedEnglishPromptMode)) {
      res.status(400).json({ message: "英文测试模式无效" });
      return;
    }
    if (assessmentId === "english-picture-naming" && !ENGLISH_WORD_PACK_IDS.includes(requestedEnglishWordPackId)) {
      res.status(400).json({ message: "英文词包无效" });
      return;
    }
    if (mode !== "self" && mode !== "child") {
      res.status(400).json({ message: "测试对象无效" });
      return;
    }
    if (!answers) {
      res.status(400).json({ message: assessmentId === "character-recognition" ? "请完成一组 800 字" : "请完成全部 40 道题" });
      return;
    }
    if (assessmentId === "english-picture-naming" && !pictureNamingAnswers) {
      const expectedCount = getEnglishWordPack(requestedEnglishWordPackId).items.length;
      res.status(400).json({ message: englishPromptMode === "word" ? `请完成全部 ${expectedCount} 个单词` : `请完成全部 ${expectedCount} 张图片` });
      return;
    }
    if (assessmentId === "character-recognition" && !sampleCharacters) {
      res.status(400).json({ message: "本次识字样本无效，请重新开始" });
      return;
    }
    if (["character-recognition", "english-picture-naming"].includes(assessmentId) && mode !== "child") {
      res.status(400).json({ message: "该测试需要选择孩子档案" });
      return;
    }
    let childName = "";
    if (mode === "child") {
      if (!childId) {
        res.status(400).json({ message: "请选择孩子档案" });
        return;
      }
      const sync = await UserXiaowanziSync.findOne({ userId }).select("childProfiles").lean();
      const child = (sync?.childProfiles || []).find((item: any) => String(item?.id || "") === childId);
      if (!child) {
        res.status(404).json({ message: "孩子档案不存在或不属于当前账号" });
        return;
      }
      childName = String((child as any).title || (child as any).name || "").trim();
    }

    let recognitionSummary: FlashTestRecognitionSummary | undefined;
    if (assessmentId === "character-recognition") {
      recognitionSummary = scoreCharacterRecognition(answers, recognitionGroup);
    }

    const result = await FlashTestResult.create({
      userId,
      assessmentId,
      assessmentVersion,
      mode,
      childId: mode === "child" ? childId : "",
      childName,
      answers,
      sampleCharacters,
      scores: assessmentId === "eight-talents" ? scoreEightTalents(answers) : [],
      recognitionSummary,
      recognitionGroup: assessmentId === "character-recognition" ? recognitionGroup : undefined,
      pictureNamingAnswers,
      pictureNamingSummary: pictureNamingAnswers ? scorePictureNaming(pictureNamingAnswers) : undefined,
      englishPromptMode,
      englishWordPackId,
      completedAt: new Date(),
    });
    res.status(201).json({ result: serializeResult(result) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "测试结果保存失败" });
  }
});

router.get("/results", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assessmentId = String(req.query.assessmentId || "").trim();
    const mode = String(req.query.mode || "").trim();
    const childId = String(req.query.childId || "").trim();
    const englishPromptMode = String(req.query.englishPromptMode || "").trim();
    const englishWordPackId = String(req.query.englishWordPackId || "").trim();
    if (assessmentId && !SUPPORTED_ASSESSMENT_IDS.includes(assessmentId as any)) {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    if (mode && mode !== "self" && mode !== "child") {
      res.status(400).json({ message: "测试对象无效" });
      return;
    }
    if (childId && mode !== "child") {
      res.status(400).json({ message: "孩子档案参数无效" });
      return;
    }
    if (englishPromptMode && (assessmentId !== "english-picture-naming" || !["picture", "word"].includes(englishPromptMode))) {
      res.status(400).json({ message: "英文测试模式无效" });
      return;
    }
    if (englishWordPackId && (assessmentId !== "english-picture-naming" || !ENGLISH_WORD_PACK_IDS.includes(englishWordPackId))) {
      res.status(400).json({ message: "英文词包无效" });
      return;
    }
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter: Record<string, unknown> = { userId: req.user?.id };
    if (assessmentId) filter.assessmentId = assessmentId;
    if (mode) filter.mode = mode;
    if (childId) filter.childId = childId;
    if (englishPromptMode === "word") filter.englishPromptMode = "word";
    if (englishPromptMode === "picture") filter.englishPromptMode = { $in: ["picture", null] };
    if (englishWordPackId === DEFAULT_ENGLISH_WORD_PACK_ID) filter.englishWordPackId = { $in: [DEFAULT_ENGLISH_WORD_PACK_ID, null] };
    if (englishWordPackId && englishWordPackId !== DEFAULT_ENGLISH_WORD_PACK_ID) filter.englishWordPackId = englishWordPackId;
    const results = await FlashTestResult.find(filter)
      .sort({ completedAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    let recognitionGroups: Record<string, ReturnType<typeof serializeRecognitionGroupMastery>> | undefined;
    let englishWordPackResults: Record<string, ReturnType<typeof serializeEnglishWordPackMastery>> | undefined;
    if (assessmentId === "character-recognition") {
      const groupFilter = { ...filter, assessmentId: "character-recognition" };
      const [firstGroup, secondGroup, legacyResult] = await Promise.all([
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 800,
          recognitionGroup: { $ne: 2 },
        }).sort({ completedAt: -1, _id: -1 }).lean(),
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 800,
          recognitionGroup: 2,
        }).sort({ completedAt: -1, _id: -1 }).lean(),
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 1600,
        }).sort({ completedAt: -1, _id: -1 }).lean(),
      ]);
      recognitionGroups = {
        1: latestRecognitionGroupMastery(firstGroup, legacyResult, 1),
        2: latestRecognitionGroupMastery(secondGroup, legacyResult, 2),
      };
    }
    if (assessmentId === "english-picture-naming" && englishPromptMode === "word") {
      const packFilter = { ...filter };
      delete packFilter.englishWordPackId;
      const latestPackResults = await Promise.all(ENGLISH_WORD_PACK_IDS.map((packId) => FlashTestResult.findOne({
        ...packFilter,
        englishWordPackId: packId === DEFAULT_ENGLISH_WORD_PACK_ID
          ? { $in: [DEFAULT_ENGLISH_WORD_PACK_ID, null] }
          : packId,
      }).sort({ completedAt: -1, _id: -1 }).lean()));
      englishWordPackResults = Object.fromEntries(ENGLISH_WORD_PACK_IDS.map((packId, index) => [
        packId,
        serializeEnglishWordPackMastery(latestPackResults[index], packId),
      ]));
    }
    res.json({ results: results.map(serializeResult), recognitionGroups, englishWordPackResults });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "测试结果读取失败" });
  }
});

export default router;
