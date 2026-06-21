const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: "new"});
  const page = await browser.newPage();
  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
<div class="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-4">
<div class="text-left"><span id="time" class="inline-block text-[10px] font-bold leading-[1]">01:37-02:03</span></div>
<div class="text-left"><p id="speaker" class="text-[10px] leading-[1] font-black tracking-widest text-blue-500 mb-2">嘉宾 | 陈碧君</p></div>
<div></div>
<div class="text-left"><p id="body" class="text-base">保研到底在指向什么？而且保研这个词...</p></div>
</div>
</body>
</html>
  `);
  const timeBox = await page.$eval('#time', el => el.getBoundingClientRect());
  const speakerBox = await page.$eval('#speaker', el => el.getBoundingClientRect());
  const bodyBox = await page.$eval('#body', el => el.getBoundingClientRect());
  console.log('Time:', timeBox);
  console.log('Speaker:', speakerBox);
  console.log('Body:', bodyBox);
  await browser.close();
})();
