const ENGLISH_PICTURE_NAMING_VERSION = "2026-08-14-prea1-packs-r2";
const DEFAULT_ENGLISH_WORD_PACK_ID = "animals";

const ENGLISH_WORD_PACKS = [
  {
    id: "animals",
    title: "动物",
    subtitle: "常见动物",
    items: [
      { id: "animal-cat", word: "cat", ipa: "/kæt/", image: "/pages/flash-test/assets/english-picture-naming/cat.jpg" },
      { id: "animal-dog", word: "dog", ipa: "/dɒɡ/", image: "/pages/flash-test/assets/english-picture-naming/dog.jpg" },
      { id: "animal-bird", word: "bird", ipa: "/bɜːd/", image: "/pages/flash-test/assets/english-picture-naming/bird.jpg" },
      { id: "animal-fish", word: "fish", ipa: "/fɪʃ/", image: "/pages/flash-test/assets/english-picture-naming/fish.jpg" },
      { id: "animal-duck", word: "duck", ipa: "/dʌk/", image: "/pages/flash-test/assets/english-picture-naming/duck.jpg" },
      { id: "animal-horse", word: "horse", ipa: "/hɔːs/", image: "/pages/flash-test/assets/english-picture-naming/horse.jpg" },
      { id: "animal-cow", word: "cow", ipa: "/kaʊ/", image: "/pages/flash-test/assets/english-picture-naming/cow.jpg" },
      { id: "animal-sheep", word: "sheep", ipa: "/ʃiːp/", image: "/pages/flash-test/assets/english-picture-naming/sheep.jpg" },
      { id: "animal-elephant", word: "elephant", ipa: "/ˈelɪfənt/", image: "/pages/flash-test/assets/english-picture-naming/elephant.jpg" },
      { id: "animal-monkey", word: "monkey", ipa: "/ˈmʌŋki/", image: "/pages/flash-test/assets/english-picture-naming/monkey.jpg" }
    ]
  },
  {
    id: "food",
    title: "食物与饮品",
    subtitle: "水果、主食与蔬菜",
    items: [
      { id: "food-apple", word: "apple", ipa: "/ˈæpəl/", image: "/pages/flash-test/assets/english-picture-naming/apple.webp" },
      { id: "food-banana", word: "banana", ipa: "/bəˈnɑːnə/", image: "/pages/flash-test/assets/english-picture-naming/banana-focus.webp" },
      { id: "food-orange", word: "orange", ipa: "/ˈɒrɪndʒ/", image: "/pages/flash-test/assets/english-picture-naming/orange.webp" },
      { id: "food-egg", word: "egg", ipa: "/eɡ/", image: "/pages/flash-test/assets/english-picture-naming/egg.webp" },
      { id: "food-bread", word: "bread", ipa: "/bred/", image: "/pages/flash-test/assets/english-picture-naming/bread.webp" },
      { id: "food-cake", word: "cake", ipa: "/keɪk/", image: "/pages/flash-test/assets/english-picture-naming/cake.webp" },
      { id: "food-carrot", word: "carrot", ipa: "/ˈkærət/", image: "/pages/flash-test/assets/english-picture-naming/carrot.webp" },
      { id: "food-tomato", word: "tomato", ipa: "/təˈmɑːtəʊ/", image: "/pages/flash-test/assets/english-picture-naming/tomato.webp" },
      { id: "food-potato", word: "potato", ipa: "/pəˈteɪtəʊ/", image: "/pages/flash-test/assets/english-picture-naming/potato.webp" },
      { id: "food-rice", word: "rice", ipa: "/raɪs/", image: "/pages/flash-test/assets/english-picture-naming/rice.webp" }
    ]
  },
  {
    id: "home-school",
    title: "家居与学习",
    subtitle: "家中与学校常见物品",
    items: [
      { id: "home-book", word: "book", ipa: "/bʊk/", image: "/pages/flash-test/assets/english-picture-naming/book.webp" },
      { id: "home-pencil", word: "pencil", ipa: "/ˈpensəl/", image: "/pages/flash-test/assets/english-picture-naming/pencil.webp" },
      { id: "home-ruler", word: "ruler", ipa: "/ˈruːlə/", image: "/pages/flash-test/assets/english-picture-naming/ruler-focus.webp" },
      { id: "home-chair", word: "chair", ipa: "/tʃeə/", image: "/pages/flash-test/assets/english-picture-naming/chair.webp" },
      { id: "home-table", word: "table", ipa: "/ˈteɪbəl/", image: "/pages/flash-test/assets/english-picture-naming/table-focus.webp" },
      { id: "home-bed", word: "bed", ipa: "/bed/", image: "/pages/flash-test/assets/english-picture-naming/bed-modern.webp" },
      { id: "home-door", word: "door", ipa: "/dɔː/", image: "/pages/flash-test/assets/english-picture-naming/door-modern-focus.webp" },
      { id: "home-window", word: "window", ipa: "/ˈwɪndəʊ/", image: "/pages/flash-test/assets/english-picture-naming/window.webp" },
      { id: "home-clock", word: "clock", ipa: "/klɒk/", image: "/pages/flash-test/assets/english-picture-naming/clock.webp" },
      { id: "home-bag", word: "bag", ipa: "/bæɡ/", image: "/pages/flash-test/assets/english-picture-naming/bag.webp" }
    ]
  },
  {
    id: "body-clothing",
    title: "身体与穿着",
    subtitle: "身体部位与日常衣物",
    items: [
      { id: "body-hand", word: "hand", ipa: "/hænd/", image: "/pages/flash-test/assets/english-picture-naming/hand.webp" },
      { id: "body-foot", word: "foot", ipa: "/fʊt/", image: "/pages/flash-test/assets/english-picture-naming/foot.webp" },
      { id: "body-eye", word: "eye", ipa: "/aɪ/", image: "/pages/flash-test/assets/english-picture-naming/eye.webp" },
      { id: "body-ear", word: "ear", ipa: "/ɪə/", image: "/pages/flash-test/assets/english-picture-naming/ear.webp" },
      { id: "body-nose", word: "nose", ipa: "/nəʊz/", image: "/pages/flash-test/assets/english-picture-naming/nose.webp" },
      { id: "body-mouth", word: "mouth", ipa: "/maʊθ/", image: "/pages/flash-test/assets/english-picture-naming/mouth.webp" },
      { id: "body-hair", word: "hair", ipa: "/heə/", image: "/pages/flash-test/assets/english-picture-naming/hair.webp" },
      { id: "body-hat", word: "hat", ipa: "/hæt/", image: "/pages/flash-test/assets/english-picture-naming/hat.webp" },
      { id: "body-shoe", word: "shoe", ipa: "/ʃuː/", image: "/pages/flash-test/assets/english-picture-naming/shoe.webp" },
      { id: "body-shirt", word: "shirt", ipa: "/ʃɜːt/", image: "/pages/flash-test/assets/english-picture-naming/shirt.webp" }
    ]
  },
  {
    id: "transport-nature",
    title: "交通与自然",
    subtitle: "交通工具与自然物",
    items: [
      { id: "world-car", word: "car", ipa: "/kɑː/", image: "/pages/flash-test/assets/english-picture-naming/car.webp" },
      { id: "world-bus", word: "bus", ipa: "/bʌs/", image: "/pages/flash-test/assets/english-picture-naming/bus.webp" },
      { id: "world-train", word: "train", ipa: "/treɪn/", image: "/pages/flash-test/assets/english-picture-naming/train.webp" },
      { id: "world-bike", word: "bike", ipa: "/baɪk/", image: "/pages/flash-test/assets/english-picture-naming/bike.webp" },
      { id: "world-boat", word: "boat", ipa: "/bəʊt/", image: "/pages/flash-test/assets/english-picture-naming/boat.webp" },
      { id: "world-plane", word: "plane", ipa: "/pleɪn/", image: "/pages/flash-test/assets/english-picture-naming/plane.webp" },
      { id: "world-truck", word: "truck", ipa: "/trʌk/", image: "/pages/flash-test/assets/english-picture-naming/truck.webp" },
      { id: "world-sun", word: "sun", ipa: "/sʌn/", image: "/pages/flash-test/assets/english-picture-naming/sun-sky.webp" },
      { id: "world-tree", word: "tree", ipa: "/triː/", image: "/pages/flash-test/assets/english-picture-naming/tree.webp" },
      { id: "world-flower", word: "flower", ipa: "/ˈflaʊə/", image: "/pages/flash-test/assets/english-picture-naming/flower.webp" }
    ]
  }
];

function getEnglishWordPack(packId) {
  return ENGLISH_WORD_PACKS.find((pack) => pack.id === packId)
    || ENGLISH_WORD_PACKS.find((pack) => pack.id === DEFAULT_ENGLISH_WORD_PACK_ID);
}

const ENGLISH_PICTURE_NAMING_BANK = getEnglishWordPack(DEFAULT_ENGLISH_WORD_PACK_ID).items;

function buildEnglishPictureNamingSummary(attempts, totalCount = ENGLISH_PICTURE_NAMING_BANK.length) {
  const values = Array.isArray(attempts) ? attempts : [];
  const matchedCount = values.filter((item) => item && item.status === "matched").length;
  const needsPracticeCount = values.filter((item) => item && item.status === "unmatched").length;
  const skippedCount = values.filter((item) => item && item.status === "skipped").length;
  return {
    totalCount,
    matchedCount,
    needsPracticeCount,
    skippedCount
  };
}

module.exports = {
  DEFAULT_ENGLISH_WORD_PACK_ID,
  ENGLISH_PICTURE_NAMING_BANK,
  ENGLISH_PICTURE_NAMING_VERSION,
  ENGLISH_WORD_PACKS,
  buildEnglishPictureNamingSummary,
  getEnglishWordPack
};
