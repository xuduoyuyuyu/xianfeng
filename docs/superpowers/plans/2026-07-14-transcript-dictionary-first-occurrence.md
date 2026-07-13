# Transcript Dictionary First Occurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each education dictionary entry clickable and highlighted only on its first occurrence across an entire program transcript.

**Architecture:** Keep the existing transcript normalization and node rendering pipeline. Add one per-normalization `Set` shared across transcript segments; dictionary formal names and aliases consume the same entry ID, while subsequent matches become ordinary text nodes without click metadata.

**Tech Stack:** WeChat Mini Program JavaScript/WXML, Node.js built-in test runner, repository release verification scripts.

## Global Constraints

- Deduplication applies to the complete transcript of one program, not one segment or speaker.
- A formal term and all aliases share one highlight opportunity through the normalized dictionary entry ID.
- Preserve longest-match-first behavior, transcript text, ordering, timestamps, and the existing definition dialog.
- Do not change backend APIs, persisted data, or other mini-program pages.

---

### Task 1: Highlight Each Dictionary Entry Once Per Transcript

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15215-15720`
- Modify: `apps/wechat-miniprogram/pages/webview/index.js:613-659`

**Interfaces:**
- Consumes: normalized dictionary entries shaped as `{ id, term, definition, aliases, matchTerms }`.
- Produces: `buildTranscriptDictionaryNodes(value, entries, highlightedEntryIds)` where `highlightedEntryIds` is a `Set<string>` shared by all segments in one `normalizeTranscript` call.
- Preserves: transcript `contentNodes` containing `{ type: "dictionary", text, entryId, term }` for first occurrences and `{ type: "text", text }` for all ordinary and repeated content.

- [ ] **Step 1: Extend the fixture and assertions to require transcript-wide deduplication**

Change the first two transcript fixture rows so the first row repeats the formal term and alias, and the second row repeats both names across a segment boundary:

```js
transcript: [
  {
    time: "0:00:05",
    speaker: "阿力",
    text: "国际教育也叫国际化教育，国际教育需要长期投入。教育也需要时间。",
    featured: true
  },
  {
    time: "00:00:22-00:00:26",
    speaker: "张琳",
    text: "后文再说国际化教育和教育。"
  },
  // existing remaining rows
]
```

Replace the first-segment node assertion and add a second-segment assertion:

```js
assert.deepEqual(
  context.data.nativeProgram.transcript[0].contentNodes.map((node) => [node.type, node.text, node.term || ""]),
  [
    ["dictionary", "国际教育", "国际教育"],
    ["text", "也叫国际化教育，国际教育需要长期投入。", ""],
    ["dictionary", "教育", "教育"],
    ["text", "也需要时间。", ""]
  ]
);
assert.deepEqual(context.data.nativeProgram.transcript[1].contentNodes, [
  { type: "text", text: "后文再说国际化教育和教育。" }
]);
assert.equal(
  context.data.nativeProgram.transcript
    .flatMap((item) => item.contentNodes)
    .filter((node) => node.type === "dictionary" && node.entryId === "dictionary-international-education")
    .length,
  1
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL because the current implementation creates dictionary nodes for every formal-name and alias match.

- [ ] **Step 3: Share consumed entry state across transcript segments**

Change the node builder to accept the shared set. On a repeated match, append the matched text to the current text node instead of creating dictionary click data:

```js
function buildTranscriptDictionaryNodes(value, entries, highlightedEntryIds) {
  const text = String(value || "");
  const consumedEntryIds = highlightedEntryIds instanceof Set ? highlightedEntryIds : new Set();
  const candidates = (Array.isArray(entries) ? entries : [])
    .flatMap((entry) => entry.matchTerms.map((matchText) => ({ entry, matchText })))
    .sort((left, right) => right.matchText.length - left.matchText.length);
  if (!text || !candidates.length) return text ? [{ type: "text", text }] : [];
  const nodes = [];
  const appendText = (valueToAppend) => {
    const previous = nodes[nodes.length - 1];
    if (previous && previous.type === "text") previous.text += valueToAppend;
    else nodes.push({ type: "text", text: valueToAppend });
  };
  let cursor = 0;
  while (cursor < text.length) {
    const matched = candidates.find((candidate) => text.startsWith(candidate.matchText, cursor));
    if (matched) {
      if (consumedEntryIds.has(matched.entry.id)) {
        appendText(matched.matchText);
      } else {
        nodes.push({
          type: "dictionary",
          text: matched.matchText,
          entryId: matched.entry.id,
          term: matched.entry.term
        });
        consumedEntryIds.add(matched.entry.id);
      }
      cursor += matched.matchText.length;
      continue;
    }
    appendText(text[cursor]);
    cursor += 1;
  }
  return nodes;
}
```

Create the set once for each normalized program transcript and pass it to every segment:

```js
function normalizeTranscript(value, dictionaryEntries) {
  const highlightedEntryIds = new Set();
  return Array.isArray(value)
    ? value
      .map((item) => {
        const speaker = firstText([item && item.speaker], "");
        const text = firstText([item && item.text], "");
        return {
          time: normalizeProgramTranscriptTime(item && item.time),
          speaker,
          speakerLabel: formatProgramTranscriptSpeaker(speaker),
          text,
          contentNodes: buildTranscriptDictionaryNodes(text, dictionaryEntries, highlightedEntryIds),
          featured: Boolean(item && item.featured)
        };
      })
      .filter((item) => item.text)
    : [];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS, including same-segment, cross-segment, and formal-name/alias deduplication assertions.

- [ ] **Step 5: Run the full mini-program static test**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Run release-level verification and whitespace validation**

Run:

```bash
bash scripts/release/verify-mini-webview-ready.sh
git diff --check
```

Expected: mini-program tests, WeChat backend helper tests, frontend build, and `git diff --check` all succeed.

- [ ] **Step 7: Verify the actual mini-program route when WeChat DevTools is available**

Open a production-backed program detail containing a repeated education dictionary term. Confirm the first occurrence is purple/clickable with the existing definition sheet, later formal-name and alias occurrences are ordinary non-clickable text, timestamps remain visible, and transcript text is complete.

Expected: runtime behavior matches the automated assertions. If the exact production data contains no repeated term or alias, report that limitation instead of claiming runtime coverage.

- [ ] **Step 8: Commit the focused implementation**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: highlight transcript dictionary terms once"
```
