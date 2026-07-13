# Mini Program Transcript Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display every native mini-program transcript row and normalize every existing timestamp to `HH:MM:SS` without inventing missing timestamps.

**Architecture:** Keep normalization at the native program-detail adapter boundary in `pages/webview/index.js`. Add one focused timestamp formatter beside the existing speaker formatter, remove the display-only row cap, and exercise the behavior through the existing page-definition runtime test.

**Tech Stack:** WeChat Mini Program JavaScript/WXML, Node.js built-in test runner, `node:assert/strict`.

## Global Constraints

- Do not modify production records, transcription jobs, audio, backend persistence, or deployment configuration.
- Missing timestamps remain empty.
- Existing timestamp ranges use their normalized start point for display.
- Existing speaker labels and transcript text remain unchanged.
- Do not refactor unrelated code or touch current unrelated working-tree changes.

---

### Task 1: Full Transcript and Standard Timestamp Display

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15215`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15645`
- Modify: `apps/wechat-miniprogram/pages/webview/index.js:572-588`

**Interfaces:**
- Consumes: API transcript segments shaped as `{ time?: string, speaker?: string, text?: string, featured?: boolean }`.
- Produces: `normalizeProgramTranscriptTime(value): string`, returning `HH:MM:SS` for parseable existing times and `""` otherwise.
- Produces: `normalizeTranscript(value)`, retaining every non-empty transcript row.

- [ ] **Step 1: Write the failing runtime test**

Replace the one-row transcript fixture with ten rows covering point, range, fractional, `MM:SS`, and empty inputs:

```js
transcript: [
  { time: "0:00:05", speaker: "阿力", text: "第一段。", featured: true },
  { time: "00:00:22-00:00:26", speaker: "张琳", text: "第二段。" },
  { time: "00:20-00:35", speaker: "张琳", text: "第三段。" },
  { time: "00:00:20.66", speaker: "张琳", text: "第四段。" },
  { time: "00:22", speaker: "张琳", text: "第五段。" },
  { time: "", speaker: "张琳", text: "第六段。" },
  { time: "00:01:10", speaker: "张琳", text: "第七段。" },
  { time: "00:01:20", speaker: "张琳", text: "第八段。" },
  { time: "00:01:30", speaker: "张琳", text: "第九段。" },
  { time: "00:01:40", speaker: "张琳", text: "第十段。" }
],
```

Add these assertions after the program loads:

```js
assert.equal(context.data.nativeProgram.transcript.length, 10);
assert.deepEqual(
  context.data.nativeProgram.transcript.slice(0, 6).map((item) => item.time),
  ["00:00:05", "00:00:22", "00:00:20", "00:00:20", "00:00:22", ""]
);
assert.equal(context.data.nativeProgram.transcript[0].speakerLabel, "主播·阿力");
assert.equal(context.data.nativeProgram.transcript[5].speakerLabel, "嘉宾·张琳");
assert.equal(context.data.nativeProgram.transcript[9].text, "第十段。");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native program detail"
```

Expected: FAIL because `normalizeTranscript()` returns only eight rows and leaves nonstandard timestamp strings unchanged.

- [ ] **Step 3: Implement the minimal formatter and remove the cap**

Add this function immediately before `normalizeTranscript()`:

```js
function normalizeProgramTranscriptTime(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const start = source.split("-")[0].trim().replace(/\.\d+$/, "");
  const parts = start.split(":");
  if (parts.length !== 2 && parts.length !== 3) return "";
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0)) return "";
  const totalSeconds = parts.length === 3
    ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers[0] * 60 + numbers[1];
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
```

In `normalizeTranscript()`:

```js
time: normalizeProgramTranscriptTime(item && item.time),
```

Remove only:

```js
.slice(0, 8)
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native program detail"
```

Expected: PASS with zero failures.

- [ ] **Step 5: Run the complete mini-program static test suite**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 6: Check patch scope**

Run:

```bash
git diff --check -- apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git diff -- apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: only the timestamp formatter, transcript cap removal, and focused fixture/assertion changes appear.

- [ ] **Step 7: Commit the implementation if requested**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: show complete timestamped transcripts"
```

Do not stage unrelated working-tree changes.
