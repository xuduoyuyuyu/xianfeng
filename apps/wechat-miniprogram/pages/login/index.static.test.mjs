import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("login page does not expose diagnostic AppID or request URL text", () => {
  const wxml = fs.readFileSync(new URL("./index.wxml", import.meta.url), "utf8");

  assert.equal(wxml.includes("AppID"), false);
  assert.equal(wxml.includes("requestUrl"), false);
  assert.equal(wxml.includes("debug"), false);
});

test("login page returns to the triggering web-view URL with website token", () => {
  const js = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");

  assert.match(js, /onLoad\(options\)/);
  assert.match(js, /decodeURIComponent\(options\.redirect/);
  assert.match(js, /xf_mp/);
  assert.match(js, /xf_token/);
  assert.match(js, /wx\.redirectTo/);
  assert.match(js, /\/pages\/webview\/index\?url=/);
});
