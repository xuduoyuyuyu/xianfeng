import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("mini program native tab bar mirrors the website mobile menu", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );

  assert.deepEqual(appJson.pages.slice(0, 5), [
    "pages/programs/index",
    "pages/reading/index",
    "pages/xiaowanzi/index",
    "pages/materials/index",
    "pages/topics/index"
  ]);
  assert.deepEqual(appJson.tabBar.list.map((item) => [item.pagePath, item.text, item.iconPath, item.selectedIconPath]), [
    ["pages/programs/index", "节目", "assets/tabbar/programs.png", "assets/tabbar/programs-active.png"],
    ["pages/reading/index", "及阅", "assets/tabbar/reading.png", "assets/tabbar/reading-active.png"],
    ["pages/xiaowanzi/index", "小玩子", "assets/tabbar/xiaowanzi.png", "assets/tabbar/xiaowanzi-active.png"],
    ["pages/materials/index", "资料", "assets/tabbar/materials.png", "assets/tabbar/materials-active.png"],
    ["pages/topics/index", "请教", "assets/tabbar/topics.png", "assets/tabbar/topics-active.png"]
  ]);

  for (const item of appJson.tabBar.list) {
    for (const key of ["iconPath", "selectedIconPath"]) {
      const iconPath = path.resolve(fileURLToPath(new URL("..", import.meta.url)), item[key]);
      assert.equal(fs.existsSync(iconPath), true, `${item.text} ${key} should exist at ${item[key]}`);
      const iconSize = fs.statSync(iconPath).size;
      assert.ok(iconSize > 0, `${item.text} ${key} should not be empty`);
      assert.ok(iconSize < 40 * 1024, `${item.text} ${key} should stay under 40 KB`);
    }
  }
});

test("mini program native navigation bar matches the website top nav color", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );

  assert.equal(appJson.window.navigationBarBackgroundColor, "#ffffff");
  assert.equal(appJson.window.navigationBarTextStyle, "black");
});

const pages = [
  ["programs", "WEB_ROUTES.programs"],
  ["reading", "WEB_ROUTES.reading"],
  ["xiaowanzi", "WEB_ROUTES.xiaowanzi"],
  ["materials", "WEB_ROUTES.materials"],
  ["topics", "WEB_ROUTES.topics"]
];

for (const [page, route] of pages) {
  test(`${page} tab directly renders the website route in a web-view`, () => {
    const dir = new URL(`./${page}/`, import.meta.url);
    const js = fs.readFileSync(new URL("index.js", dir), "utf8");
    const wxml = fs.readFileSync(new URL("index.wxml", dir), "utf8").trim();

    assert.equal(wxml, '<web-view src="{{src}}" />');
    assert.equal(js.includes(route), true);
    assert.equal(js.includes("webUrl("), true);
    assert.equal(js.includes("openWeb("), false);
    assert.equal(js.includes("entries:"), false);
  });
}
