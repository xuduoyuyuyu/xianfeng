const ENGLISH_PICTURE_NAMING_VERSION = "2026-08-14-prea1-packs-r4";
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
      { id: "animal-monkey", word: "monkey", ipa: "/ˈmʌŋki/", image: "/pages/flash-test/assets/english-picture-naming/monkey.jpg" },
      { id: "animal-rabbit", word: "rabbit", ipa: "/ˈræbɪt/", image: "/pages/flash-test/assets/english-picture-naming/rabbit.webp" },
      { id: "animal-pig", word: "pig", ipa: "/pɪɡ/", image: "/pages/flash-test/assets/english-picture-naming/pig.webp" },
      { id: "animal-lion", word: "lion", ipa: "/ˈlaɪən/", image: "/pages/flash-test/assets/english-picture-naming/lion.webp" },
      { id: "animal-tiger", word: "tiger", ipa: "/ˈtaɪɡə/", image: "/pages/flash-test/assets/english-picture-naming/tiger.webp" },
      { id: "animal-bear", word: "bear", ipa: "/beə/", image: "/pages/flash-test/assets/english-picture-naming/bear.webp" },
      { id: "animal-mouse", word: "mouse", ipa: "/maʊs/", image: "/pages/flash-test/assets/english-picture-naming/mouse.webp" },
      { id: "animal-frog", word: "frog", ipa: "/frɒɡ/", image: "/pages/flash-test/assets/english-picture-naming/frog.webp" },
      { id: "animal-turtle", word: "turtle", ipa: "/ˈtɜːtəl/", image: "/pages/flash-test/assets/english-picture-naming/turtle.webp" },
      { id: "animal-snake", word: "snake", ipa: "/sneɪk/", image: "/pages/flash-test/assets/english-picture-naming/snake.webp" },
      { id: "animal-giraffe", word: "giraffe", ipa: "/dʒəˈrɑːf/", image: "/pages/flash-test/assets/english-picture-naming/giraffe.webp" },
      { id: "animal-zebra", word: "zebra", ipa: "/ˈzebrə/", image: "/pages/flash-test/assets/english-picture-naming/zebra.webp" },
      { id: "animal-panda", word: "panda", ipa: "/ˈpændə/", image: "/pages/flash-test/assets/english-picture-naming/panda.webp" },
      { id: "animal-kangaroo", word: "kangaroo", ipa: "/ˌkæŋɡəˈruː/", image: "/pages/flash-test/assets/english-picture-naming/kangaroo.webp" },
      { id: "animal-deer", word: "deer", ipa: "/dɪə/", image: "/pages/flash-test/assets/english-picture-naming/deer.webp" },
      { id: "animal-goat", word: "goat", ipa: "/ɡəʊt/", image: "/pages/flash-test/assets/english-picture-naming/goat.webp" },
      { id: "animal-bee", word: "bee", ipa: "/biː/", image: "/pages/flash-test/assets/english-picture-naming/bee.webp" },
      { id: "animal-butterfly", word: "butterfly", ipa: "/ˈbʌtəflaɪ/", image: "/pages/flash-test/assets/english-picture-naming/butterfly.webp" },
      { id: "animal-ant", word: "ant", ipa: "/ænt/", image: "/pages/flash-test/assets/english-picture-naming/ant.webp" },
      { id: "animal-crab", word: "crab", ipa: "/kræb/", image: "/pages/flash-test/assets/english-picture-naming/crab.webp" },
      { id: "animal-dolphin", word: "dolphin", ipa: "/ˈdɒlfɪn/", image: "/pages/flash-test/assets/english-picture-naming/dolphin.webp" }
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
      { id: "food-rice", word: "rice", ipa: "/raɪs/", image: "/pages/flash-test/assets/english-picture-naming/rice.webp" },
      { id: "food-milk", word: "milk", ipa: "/mɪlk/", image: "/pages/flash-test/assets/english-picture-naming/milk.webp" },
      { id: "food-water", word: "water", ipa: "/ˈwɔːtə/", image: "/pages/flash-test/assets/english-picture-naming/water.webp" },
      { id: "food-juice", word: "juice", ipa: "/dʒuːs/", image: "/pages/flash-test/assets/english-picture-naming/juice.webp" },
      { id: "food-cheese", word: "cheese", ipa: "/tʃiːz/", image: "/pages/flash-test/assets/english-picture-naming/cheese.webp" },
      { id: "food-chicken", word: "chicken", ipa: "/ˈtʃɪkɪn/", image: "/pages/flash-test/assets/english-picture-naming/chicken.webp" },
      { id: "food-strawberry", word: "strawberry", ipa: "/ˈstrɔːbəri/", image: "/pages/flash-test/assets/english-picture-naming/strawberry.webp" },
      { id: "food-grape", word: "grape", ipa: "/ɡreɪp/", image: "/pages/flash-test/assets/english-picture-naming/grape.webp" },
      { id: "food-watermelon", word: "watermelon", ipa: "/ˈwɔːtəmelən/", image: "/pages/flash-test/assets/english-picture-naming/watermelon.webp" },
      { id: "food-pear", word: "pear", ipa: "/peə/", image: "/pages/flash-test/assets/english-picture-naming/pear.webp" },
      { id: "food-cherry", word: "cherry", ipa: "/ˈtʃeri/", image: "/pages/flash-test/assets/english-picture-naming/cherry.webp" },
      { id: "food-lemon", word: "lemon", ipa: "/ˈlemən/", image: "/pages/flash-test/assets/english-picture-naming/lemon.webp" },
      { id: "food-corn", word: "corn", ipa: "/kɔːn/", image: "/pages/flash-test/assets/english-picture-naming/corn.webp" },
      { id: "food-onion", word: "onion", ipa: "/ˈʌnjən/", image: "/pages/flash-test/assets/english-picture-naming/onion.webp" },
      { id: "food-mushroom", word: "mushroom", ipa: "/ˈmʌʃruːm/", image: "/pages/flash-test/assets/english-picture-naming/mushroom.webp" },
      { id: "food-noodle", word: "noodle", ipa: "/ˈnuːdəl/", image: "/pages/flash-test/assets/english-picture-naming/noodle.webp" },
      { id: "food-soup", word: "soup", ipa: "/suːp/", image: "/pages/flash-test/assets/english-picture-naming/soup.webp" },
      { id: "food-cookie", word: "cookie", ipa: "/ˈkʊki/", image: "/pages/flash-test/assets/english-picture-naming/cookie.webp" },
      { id: "food-candy", word: "candy", ipa: "/ˈkændi/", image: "/pages/flash-test/assets/english-picture-naming/candy.webp" },
      { id: "food-pizza", word: "pizza", ipa: "/ˈpiːtsə/", image: "/pages/flash-test/assets/english-picture-naming/pizza.webp" },
      { id: "food-hamburger", word: "hamburger", ipa: "/ˈhæmbɜːɡə/", image: "/pages/flash-test/assets/english-picture-naming/hamburger.webp" }
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
      { id: "home-bag", word: "bag", ipa: "/bæɡ/", image: "/pages/flash-test/assets/english-picture-naming/bag.webp" },
      { id: "home-pen", word: "pen", ipa: "/pen/", image: "/pages/flash-test/assets/english-picture-naming/pen.webp" },
      { id: "home-desk", word: "desk", ipa: "/desk/", image: "/pages/flash-test/assets/english-picture-naming/desk.webp" },
      { id: "home-cup", word: "cup", ipa: "/kʌp/", image: "/pages/flash-test/assets/english-picture-naming/cup.webp" },
      { id: "home-lamp", word: "lamp", ipa: "/læmp/", image: "/pages/flash-test/assets/english-picture-naming/lamp.webp" },
      { id: "home-box", word: "box", ipa: "/bɒks/", image: "/pages/flash-test/assets/english-picture-naming/box.webp" },
      { id: "home-eraser", word: "eraser", ipa: "/ɪˈreɪzə/", image: "/pages/flash-test/assets/english-picture-naming/eraser.webp" },
      { id: "home-notebook", word: "notebook", ipa: "/ˈnəʊtbʊk/", image: "/pages/flash-test/assets/english-picture-naming/notebook.webp" },
      { id: "home-calculator", word: "calculator", ipa: "/ˈkælkjəleɪtə/", image: "/pages/flash-test/assets/english-picture-naming/calculator.webp" },
      { id: "home-scissors", word: "scissors", ipa: "/ˈsɪzəz/", image: "/pages/flash-test/assets/english-picture-naming/scissors.webp" },
      { id: "home-glue", word: "glue", ipa: "/ɡluː/", image: "/pages/flash-test/assets/english-picture-naming/glue.webp" },
      { id: "home-computer", word: "computer", ipa: "/kəmˈpjuːtə/", image: "/pages/flash-test/assets/english-picture-naming/computer.webp" },
      { id: "home-phone", word: "phone", ipa: "/fəʊn/", image: "/pages/flash-test/assets/english-picture-naming/phone.webp" },
      { id: "home-television", word: "television", ipa: "/ˈtelɪvɪʒən/", image: "/pages/flash-test/assets/english-picture-naming/television.webp" },
      { id: "home-fridge", word: "fridge", ipa: "/frɪdʒ/", image: "/pages/flash-test/assets/english-picture-naming/fridge.webp" },
      { id: "home-spoon", word: "spoon", ipa: "/spuːn/", image: "/pages/flash-test/assets/english-picture-naming/spoon.webp" },
      { id: "home-fork", word: "fork", ipa: "/fɔːk/", image: "/pages/flash-test/assets/english-picture-naming/fork.webp" },
      { id: "home-plate", word: "plate", ipa: "/pleɪt/", image: "/pages/flash-test/assets/english-picture-naming/plate.webp" },
      { id: "home-bowl", word: "bowl", ipa: "/bəʊl/", image: "/pages/flash-test/assets/english-picture-naming/bowl.webp" },
      { id: "home-key", word: "key", ipa: "/kiː/", image: "/pages/flash-test/assets/english-picture-naming/key.webp" },
      { id: "home-umbrella", word: "umbrella", ipa: "/ʌmˈbrelə/", image: "/pages/flash-test/assets/english-picture-naming/umbrella.webp" }
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
      { id: "body-shirt", word: "shirt", ipa: "/ʃɜːt/", image: "/pages/flash-test/assets/english-picture-naming/shirt.webp" },
      { id: "body-arm", word: "arm", ipa: "/ɑːm/", image: "/pages/flash-test/assets/english-picture-naming/arm.webp" },
      { id: "body-leg", word: "leg", ipa: "/leɡ/", image: "/pages/flash-test/assets/english-picture-naming/leg.webp" },
      { id: "body-face", word: "face", ipa: "/feɪs/", image: "/pages/flash-test/assets/english-picture-naming/face.webp" },
      { id: "body-coat", word: "coat", ipa: "/kəʊt/", image: "/pages/flash-test/assets/english-picture-naming/coat.webp" },
      { id: "body-dress", word: "dress", ipa: "/dres/", image: "/pages/flash-test/assets/english-picture-naming/dress.webp" },
      { id: "body-socks", word: "socks", ipa: "/sɒks/", image: "/pages/flash-test/assets/english-picture-naming/socks.webp" },
      { id: "body-brooch", word: "brooch", ipa: "/brəʊtʃ/", image: "/pages/flash-test/assets/english-picture-naming/brooch.webp" },
      { id: "body-button", word: "button", ipa: "/ˈbʌtən/", image: "/pages/flash-test/assets/english-picture-naming/button.webp" },
      { id: "body-wallet", word: "wallet", ipa: "/ˈwɒlɪt/", image: "/pages/flash-test/assets/english-picture-naming/wallet.webp" },
      { id: "body-zipper", word: "zipper", ipa: "/ˈzɪpə/", image: "/pages/flash-test/assets/english-picture-naming/zipper.webp" },
      { id: "body-gloves", word: "gloves", ipa: "/ɡlʌvz/", image: "/pages/flash-test/assets/english-picture-naming/gloves.webp" },
      { id: "body-glasses", word: "glasses", ipa: "/ˈɡlɑːsɪz/", image: "/pages/flash-test/assets/english-picture-naming/glasses.webp" },
      { id: "body-ribbon", word: "ribbon", ipa: "/ˈrɪbən/", image: "/pages/flash-test/assets/english-picture-naming/ribbon.webp" },
      { id: "body-cap", word: "cap", ipa: "/kæp/", image: "/pages/flash-test/assets/english-picture-naming/cap.webp" },
      { id: "body-boots", word: "boots", ipa: "/buːts/", image: "/pages/flash-test/assets/english-picture-naming/boots.webp" },
      { id: "body-belt", word: "belt", ipa: "/belt/", image: "/pages/flash-test/assets/english-picture-naming/belt.webp" },
      { id: "body-comb", word: "comb", ipa: "/kəʊm/", image: "/pages/flash-test/assets/english-picture-naming/comb.webp" },
      { id: "body-watch", word: "watch", ipa: "/wɒtʃ/", image: "/pages/flash-test/assets/english-picture-naming/watch.webp" },
      { id: "body-ring", word: "ring", ipa: "/rɪŋ/", image: "/pages/flash-test/assets/english-picture-naming/ring.webp" },
      { id: "body-pendant", word: "pendant", ipa: "/ˈpendənt/", image: "/pages/flash-test/assets/english-picture-naming/pendant.webp" }
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
      { id: "world-flower", word: "flower", ipa: "/ˈflaʊə/", image: "/pages/flash-test/assets/english-picture-naming/flower.webp" },
      { id: "world-taxi", word: "taxi", ipa: "/ˈtæksi/", image: "/pages/flash-test/assets/english-picture-naming/taxi.webp" },
      { id: "world-ship", word: "ship", ipa: "/ʃɪp/", image: "/pages/flash-test/assets/english-picture-naming/ship.webp" },
      { id: "world-moon", word: "moon", ipa: "/muːn/", image: "/pages/flash-test/assets/english-picture-naming/moon.webp" },
      { id: "world-cloud", word: "cloud", ipa: "/klaʊd/", image: "/pages/flash-test/assets/english-picture-naming/cloud.webp" },
      { id: "world-rain", word: "rain", ipa: "/reɪn/", image: "/pages/flash-test/assets/english-picture-naming/rain.webp" },
      { id: "world-road", word: "road", ipa: "/rəʊd/", image: "/pages/flash-test/assets/english-picture-naming/road.webp" },
      { id: "world-bridge", word: "bridge", ipa: "/brɪdʒ/", image: "/pages/flash-test/assets/english-picture-naming/bridge.webp" },
      { id: "world-van", word: "van", ipa: "/væn/", image: "/pages/flash-test/assets/english-picture-naming/van.webp" },
      { id: "world-helicopter", word: "helicopter", ipa: "/ˈhelɪkɒptə/", image: "/pages/flash-test/assets/english-picture-naming/helicopter.webp" },
      { id: "world-motorcycle", word: "motorcycle", ipa: "/ˈməʊtəsaɪkəl/", image: "/pages/flash-test/assets/english-picture-naming/motorcycle.webp" },
      { id: "world-subway", word: "subway", ipa: "/ˈsʌbweɪ/", image: "/pages/flash-test/assets/english-picture-naming/subway.webp" },
      { id: "world-mountain", word: "mountain", ipa: "/ˈmaʊntɪn/", image: "/pages/flash-test/assets/english-picture-naming/mountain.webp" },
      { id: "world-river", word: "river", ipa: "/ˈrɪvə/", image: "/pages/flash-test/assets/english-picture-naming/river.webp" },
      { id: "world-lake", word: "lake", ipa: "/leɪk/", image: "/pages/flash-test/assets/english-picture-naming/lake.webp" },
      { id: "world-sea", word: "sea", ipa: "/siː/", image: "/pages/flash-test/assets/english-picture-naming/sea.webp" },
      { id: "world-grass", word: "grass", ipa: "/ɡrɑːs/", image: "/pages/flash-test/assets/english-picture-naming/grass.webp" },
      { id: "world-forest", word: "forest", ipa: "/ˈfɒrɪst/", image: "/pages/flash-test/assets/english-picture-naming/forest.webp" },
      { id: "world-snow", word: "snow", ipa: "/snəʊ/", image: "/pages/flash-test/assets/english-picture-naming/snow.webp" },
      { id: "world-rainbow", word: "rainbow", ipa: "/ˈreɪnbəʊ/", image: "/pages/flash-test/assets/english-picture-naming/rainbow.webp" },
      { id: "world-rock", word: "rock", ipa: "/rɒk/", image: "/pages/flash-test/assets/english-picture-naming/rock.webp" }
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
