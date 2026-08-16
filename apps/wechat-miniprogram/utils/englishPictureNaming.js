const { API_ORIGIN } = require("./config");

const ENGLISH_PICTURE_NAMING_VERSION = "2026-08-14-prea1-packs-r4";
const DEFAULT_ENGLISH_WORD_PACK_ID = "animals";
const ENGLISH_PICTURE_ASSET_ORIGIN = `${API_ORIGIN}/api/flash-tests/english-picture-naming/assets`;

const ENGLISH_WORD_PACKS = [
  {
    id: "animals",
    title: "动物",
    subtitle: "常见动物",
    items: [
      { id: "animal-cat", word: "cat", ipa: "/kæt/", image: "cat.jpg" },
      { id: "animal-dog", word: "dog", ipa: "/dɒɡ/", image: "dog.jpg" },
      { id: "animal-bird", word: "bird", ipa: "/bɜːd/", image: "bird.jpg" },
      { id: "animal-fish", word: "fish", ipa: "/fɪʃ/", image: "fish.jpg" },
      { id: "animal-duck", word: "duck", ipa: "/dʌk/", image: "duck.jpg" },
      { id: "animal-horse", word: "horse", ipa: "/hɔːs/", image: "horse.jpg" },
      { id: "animal-cow", word: "cow", ipa: "/kaʊ/", image: "cow.jpg" },
      { id: "animal-sheep", word: "sheep", ipa: "/ʃiːp/", image: "sheep.jpg" },
      { id: "animal-elephant", word: "elephant", ipa: "/ˈelɪfənt/", image: "elephant.jpg" },
      { id: "animal-monkey", word: "monkey", ipa: "/ˈmʌŋki/", image: "monkey.jpg" },
      { id: "animal-rabbit", word: "rabbit", ipa: "/ˈræbɪt/", image: "rabbit.webp" },
      { id: "animal-pig", word: "pig", ipa: "/pɪɡ/", image: "pig.webp" },
      { id: "animal-lion", word: "lion", ipa: "/ˈlaɪən/", image: "lion.webp" },
      { id: "animal-tiger", word: "tiger", ipa: "/ˈtaɪɡə/", image: "tiger.webp" },
      { id: "animal-bear", word: "bear", ipa: "/beə/", image: "bear.webp" },
      { id: "animal-mouse", word: "mouse", ipa: "/maʊs/", image: "mouse.webp" },
      { id: "animal-frog", word: "frog", ipa: "/frɒɡ/", image: "frog.webp" },
      { id: "animal-turtle", word: "turtle", ipa: "/ˈtɜːtəl/", image: "turtle.webp" },
      { id: "animal-snake", word: "snake", ipa: "/sneɪk/", image: "snake.webp" },
      { id: "animal-giraffe", word: "giraffe", ipa: "/dʒəˈrɑːf/", image: "giraffe.webp" },
      { id: "animal-zebra", word: "zebra", ipa: "/ˈzebrə/", image: "zebra.webp" },
      { id: "animal-panda", word: "panda", ipa: "/ˈpændə/", image: "panda.webp" },
      { id: "animal-kangaroo", word: "kangaroo", ipa: "/ˌkæŋɡəˈruː/", image: "kangaroo.webp" },
      { id: "animal-deer", word: "deer", ipa: "/dɪə/", image: "deer.webp" },
      { id: "animal-goat", word: "goat", ipa: "/ɡəʊt/", image: "goat.webp" },
      { id: "animal-bee", word: "bee", ipa: "/biː/", image: "bee.webp" },
      { id: "animal-butterfly", word: "butterfly", ipa: "/ˈbʌtəflaɪ/", image: "butterfly.webp" },
      { id: "animal-ant", word: "ant", ipa: "/ænt/", image: "ant.webp" },
      { id: "animal-crab", word: "crab", ipa: "/kræb/", image: "crab.webp" },
      { id: "animal-dolphin", word: "dolphin", ipa: "/ˈdɒlfɪn/", image: "dolphin.webp" }
    ]
  },
  {
    id: "food",
    title: "食物与饮品",
    subtitle: "水果、主食与蔬菜",
    items: [
      { id: "food-apple", word: "apple", ipa: "/ˈæpəl/", image: "apple.webp" },
      { id: "food-banana", word: "banana", ipa: "/bəˈnɑːnə/", image: "banana-focus.webp" },
      { id: "food-orange", word: "orange", ipa: "/ˈɒrɪndʒ/", image: "orange.webp" },
      { id: "food-egg", word: "egg", ipa: "/eɡ/", image: "egg.webp" },
      { id: "food-bread", word: "bread", ipa: "/bred/", image: "bread.webp" },
      { id: "food-cake", word: "cake", ipa: "/keɪk/", image: "cake.webp" },
      { id: "food-carrot", word: "carrot", ipa: "/ˈkærət/", image: "carrot.webp" },
      { id: "food-tomato", word: "tomato", ipa: "/təˈmɑːtəʊ/", image: "tomato.webp" },
      { id: "food-potato", word: "potato", ipa: "/pəˈteɪtəʊ/", image: "potato.webp" },
      { id: "food-rice", word: "rice", ipa: "/raɪs/", image: "rice.webp" },
      { id: "food-milk", word: "milk", ipa: "/mɪlk/", image: "milk.webp" },
      { id: "food-water", word: "water", ipa: "/ˈwɔːtə/", image: "water.webp" },
      { id: "food-juice", word: "juice", ipa: "/dʒuːs/", image: "juice.webp" },
      { id: "food-cheese", word: "cheese", ipa: "/tʃiːz/", image: "cheese.webp" },
      { id: "food-chicken", word: "chicken", ipa: "/ˈtʃɪkɪn/", image: "chicken.webp" },
      { id: "food-strawberry", word: "strawberry", ipa: "/ˈstrɔːbəri/", image: "strawberry.webp" },
      { id: "food-grape", word: "grape", ipa: "/ɡreɪp/", image: "grape.webp" },
      { id: "food-watermelon", word: "watermelon", ipa: "/ˈwɔːtəmelən/", image: "watermelon.webp" },
      { id: "food-pear", word: "pear", ipa: "/peə/", image: "pear.webp" },
      { id: "food-cherry", word: "cherry", ipa: "/ˈtʃeri/", image: "cherry.webp" },
      { id: "food-lemon", word: "lemon", ipa: "/ˈlemən/", image: "lemon.webp" },
      { id: "food-corn", word: "corn", ipa: "/kɔːn/", image: "corn.webp" },
      { id: "food-onion", word: "onion", ipa: "/ˈʌnjən/", image: "onion.webp" },
      { id: "food-mushroom", word: "mushroom", ipa: "/ˈmʌʃruːm/", image: "mushroom.webp" },
      { id: "food-noodle", word: "noodle", ipa: "/ˈnuːdəl/", image: "noodle.webp" },
      { id: "food-soup", word: "soup", ipa: "/suːp/", image: "soup.webp" },
      { id: "food-cookie", word: "cookie", ipa: "/ˈkʊki/", image: "cookie.webp" },
      { id: "food-candy", word: "candy", ipa: "/ˈkændi/", image: "candy.webp" },
      { id: "food-pizza", word: "pizza", ipa: "/ˈpiːtsə/", image: "pizza.webp" },
      { id: "food-hamburger", word: "hamburger", ipa: "/ˈhæmbɜːɡə/", image: "hamburger.webp" }
    ]
  },
  {
    id: "home-school",
    title: "家居与学习",
    subtitle: "家中与学校常见物品",
    items: [
      { id: "home-book", word: "book", ipa: "/bʊk/", image: "book.webp" },
      { id: "home-pencil", word: "pencil", ipa: "/ˈpensəl/", image: "pencil.webp" },
      { id: "home-ruler", word: "ruler", ipa: "/ˈruːlə/", image: "ruler-focus.webp" },
      { id: "home-chair", word: "chair", ipa: "/tʃeə/", image: "chair.webp" },
      { id: "home-table", word: "table", ipa: "/ˈteɪbəl/", image: "table-focus.webp" },
      { id: "home-bed", word: "bed", ipa: "/bed/", image: "bed-modern.webp" },
      { id: "home-door", word: "door", ipa: "/dɔː/", image: "door-modern-focus.webp" },
      { id: "home-window", word: "window", ipa: "/ˈwɪndəʊ/", image: "window.webp" },
      { id: "home-clock", word: "clock", ipa: "/klɒk/", image: "clock.webp" },
      { id: "home-bag", word: "bag", ipa: "/bæɡ/", image: "bag.webp" },
      { id: "home-pen", word: "pen", ipa: "/pen/", image: "pen.webp" },
      { id: "home-desk", word: "desk", ipa: "/desk/", image: "desk.webp" },
      { id: "home-cup", word: "cup", ipa: "/kʌp/", image: "cup.webp" },
      { id: "home-lamp", word: "lamp", ipa: "/læmp/", image: "lamp.webp" },
      { id: "home-box", word: "box", ipa: "/bɒks/", image: "box.webp" },
      { id: "home-eraser", word: "eraser", ipa: "/ɪˈreɪzə/", image: "eraser.webp" },
      { id: "home-notebook", word: "notebook", ipa: "/ˈnəʊtbʊk/", image: "notebook.webp" },
      { id: "home-calculator", word: "calculator", ipa: "/ˈkælkjəleɪtə/", image: "calculator.webp" },
      { id: "home-scissors", word: "scissors", ipa: "/ˈsɪzəz/", image: "scissors.webp" },
      { id: "home-glue", word: "glue", ipa: "/ɡluː/", image: "glue.webp" },
      { id: "home-computer", word: "computer", ipa: "/kəmˈpjuːtə/", image: "computer.webp" },
      { id: "home-phone", word: "phone", ipa: "/fəʊn/", image: "phone.webp" },
      { id: "home-television", word: "television", ipa: "/ˈtelɪvɪʒən/", image: "television.webp" },
      { id: "home-fridge", word: "fridge", ipa: "/frɪdʒ/", image: "fridge.webp" },
      { id: "home-spoon", word: "spoon", ipa: "/spuːn/", image: "spoon.webp" },
      { id: "home-fork", word: "fork", ipa: "/fɔːk/", image: "fork.webp" },
      { id: "home-plate", word: "plate", ipa: "/pleɪt/", image: "plate.webp" },
      { id: "home-bowl", word: "bowl", ipa: "/bəʊl/", image: "bowl.webp" },
      { id: "home-key", word: "key", ipa: "/kiː/", image: "key.webp" },
      { id: "home-umbrella", word: "umbrella", ipa: "/ʌmˈbrelə/", image: "umbrella.webp" }
    ]
  },
  {
    id: "body-clothing",
    title: "身体与穿着",
    subtitle: "身体部位与日常衣物",
    items: [
      { id: "body-hand", word: "hand", ipa: "/hænd/", image: "hand.webp" },
      { id: "body-foot", word: "foot", ipa: "/fʊt/", image: "foot.webp" },
      { id: "body-eye", word: "eye", ipa: "/aɪ/", image: "eye.webp" },
      { id: "body-ear", word: "ear", ipa: "/ɪə/", image: "ear.webp" },
      { id: "body-nose", word: "nose", ipa: "/nəʊz/", image: "nose.webp" },
      { id: "body-mouth", word: "mouth", ipa: "/maʊθ/", image: "mouth.webp" },
      { id: "body-hair", word: "hair", ipa: "/heə/", image: "hair.webp" },
      { id: "body-hat", word: "hat", ipa: "/hæt/", image: "hat.webp" },
      { id: "body-shoe", word: "shoe", ipa: "/ʃuː/", image: "shoe.webp" },
      { id: "body-shirt", word: "shirt", ipa: "/ʃɜːt/", image: "shirt.webp" },
      { id: "body-arm", word: "arm", ipa: "/ɑːm/", image: "arm.webp" },
      { id: "body-leg", word: "leg", ipa: "/leɡ/", image: "leg.webp" },
      { id: "body-face", word: "face", ipa: "/feɪs/", image: "face.webp" },
      { id: "body-coat", word: "coat", ipa: "/kəʊt/", image: "coat.webp" },
      { id: "body-dress", word: "dress", ipa: "/dres/", image: "dress.webp" },
      { id: "body-socks", word: "socks", ipa: "/sɒks/", image: "socks.webp" },
      { id: "body-brooch", word: "brooch", ipa: "/brəʊtʃ/", image: "brooch.webp" },
      { id: "body-button", word: "button", ipa: "/ˈbʌtən/", image: "button.webp" },
      { id: "body-wallet", word: "wallet", ipa: "/ˈwɒlɪt/", image: "wallet.webp" },
      { id: "body-zipper", word: "zipper", ipa: "/ˈzɪpə/", image: "zipper.webp" },
      { id: "body-gloves", word: "gloves", ipa: "/ɡlʌvz/", image: "gloves.webp" },
      { id: "body-glasses", word: "glasses", ipa: "/ˈɡlɑːsɪz/", image: "glasses.webp" },
      { id: "body-ribbon", word: "ribbon", ipa: "/ˈrɪbən/", image: "ribbon.webp" },
      { id: "body-cap", word: "cap", ipa: "/kæp/", image: "cap.webp" },
      { id: "body-boots", word: "boots", ipa: "/buːts/", image: "boots.webp" },
      { id: "body-belt", word: "belt", ipa: "/belt/", image: "belt.webp" },
      { id: "body-comb", word: "comb", ipa: "/kəʊm/", image: "comb.webp" },
      { id: "body-watch", word: "watch", ipa: "/wɒtʃ/", image: "watch.webp" },
      { id: "body-ring", word: "ring", ipa: "/rɪŋ/", image: "ring.webp" },
      { id: "body-pendant", word: "pendant", ipa: "/ˈpendənt/", image: "pendant.webp" }
    ]
  },
  {
    id: "transport-nature",
    title: "交通与自然",
    subtitle: "交通工具与自然物",
    items: [
      { id: "world-car", word: "car", ipa: "/kɑː/", image: "car.webp" },
      { id: "world-bus", word: "bus", ipa: "/bʌs/", image: "bus.webp" },
      { id: "world-train", word: "train", ipa: "/treɪn/", image: "train.webp" },
      { id: "world-bike", word: "bike", ipa: "/baɪk/", image: "bike.webp" },
      { id: "world-boat", word: "boat", ipa: "/bəʊt/", image: "boat.webp" },
      { id: "world-plane", word: "plane", ipa: "/pleɪn/", image: "plane.webp" },
      { id: "world-truck", word: "truck", ipa: "/trʌk/", image: "truck.webp" },
      { id: "world-sun", word: "sun", ipa: "/sʌn/", image: "sun-sky.webp" },
      { id: "world-tree", word: "tree", ipa: "/triː/", image: "tree.webp" },
      { id: "world-flower", word: "flower", ipa: "/ˈflaʊə/", image: "flower.webp" },
      { id: "world-taxi", word: "taxi", ipa: "/ˈtæksi/", image: "taxi.webp" },
      { id: "world-ship", word: "ship", ipa: "/ʃɪp/", image: "ship.webp" },
      { id: "world-moon", word: "moon", ipa: "/muːn/", image: "moon.webp" },
      { id: "world-cloud", word: "cloud", ipa: "/klaʊd/", image: "cloud.webp" },
      { id: "world-rain", word: "rain", ipa: "/reɪn/", image: "rain.webp" },
      { id: "world-road", word: "road", ipa: "/rəʊd/", image: "road.webp" },
      { id: "world-bridge", word: "bridge", ipa: "/brɪdʒ/", image: "bridge.webp" },
      { id: "world-van", word: "van", ipa: "/væn/", image: "van.webp" },
      { id: "world-helicopter", word: "helicopter", ipa: "/ˈhelɪkɒptə/", image: "helicopter.webp" },
      { id: "world-motorcycle", word: "motorcycle", ipa: "/ˈməʊtəsaɪkəl/", image: "motorcycle.webp" },
      { id: "world-subway", word: "subway", ipa: "/ˈsʌbweɪ/", image: "subway.webp" },
      { id: "world-mountain", word: "mountain", ipa: "/ˈmaʊntɪn/", image: "mountain.webp" },
      { id: "world-river", word: "river", ipa: "/ˈrɪvə/", image: "river.webp" },
      { id: "world-lake", word: "lake", ipa: "/leɪk/", image: "lake.webp" },
      { id: "world-sea", word: "sea", ipa: "/siː/", image: "sea.webp" },
      { id: "world-grass", word: "grass", ipa: "/ɡrɑːs/", image: "grass.webp" },
      { id: "world-forest", word: "forest", ipa: "/ˈfɒrɪst/", image: "forest.webp" },
      { id: "world-snow", word: "snow", ipa: "/snəʊ/", image: "snow.webp" },
      { id: "world-rainbow", word: "rainbow", ipa: "/ˈreɪnbəʊ/", image: "rainbow.webp" },
      { id: "world-rock", word: "rock", ipa: "/rɒk/", image: "rock.webp" }
    ]
  }
];

for (const pack of ENGLISH_WORD_PACKS) {
  for (const item of pack.items) {
    const filename = String(item.image || "").split("/").pop();
    const fallbackFilename = filename.replace(/\.(?:webp|jpe?g)$/i, ".jpg");
    item.image = `${ENGLISH_PICTURE_ASSET_ORIGIN}/${encodeURIComponent(filename)}?v=${ENGLISH_PICTURE_NAMING_VERSION}`;
    item.fallbackImage = `${ENGLISH_PICTURE_ASSET_ORIGIN}/${encodeURIComponent(fallbackFilename)}?v=${ENGLISH_PICTURE_NAMING_VERSION}`;
  }
}

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
