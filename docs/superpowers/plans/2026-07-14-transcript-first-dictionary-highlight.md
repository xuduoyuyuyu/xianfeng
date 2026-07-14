# Transcript First Dictionary Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight each education dictionary entry only once across one complete native mini-program transcript, with all later canonical and alias matches rendered as plain text.

**Architecture:** `normalizeTranscript` creates one per-program `Set` of seen dictionary entry IDs and shares it across segment normalization in transcript order. `buildTranscriptDictionaryNodes` retains longest-match scanning, emits the first unseen entry match as an interactive dictionary node, and coalesces all later matches for that entry into ordinary text nodes.

**Tech Stack:** WeChat mini-program JavaScript, Node.js built-in test runner, existing runtime Page fixture.

## Global Constraints

- Scope is the native WeChat mini-program program-detail transcript only.
- Entry identity is the normalized dictionary entry `id`; canonical term and aliases share one highlight opportunity.
- Process transcript segments in array order and text within each segment from left to right.
- Preserve longest-match-first behavior.
- Different entries retain independent first highlights.
- A fresh transcript normalization pass must reset the seen-entry scope.
- Do not modify backend dictionary data, API payloads, or the web program page.
- Preserve the existing uncommitted timestamp-range work in `apps/wechat-miniprogram/pages/webview/index.js` and `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`; do not reset, overwrite, stage, or commit those unrelated hunks.

---

### Task 1: First Highlight Across the Complete Transcript

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: normalized dictionary entries with `id`, `term`, and `matchTerms`, plus transcript segments in API order.
- Produces: `contentNodes` where each entry ID appears as `type: "dictionary"` at most once per normalized transcript; later matches remain in `type: "text"` nodes.

- [ ] **Step 1: Extend the runtime fixture to express the complete behavior**

Keep the pending timestamp-range values unchanged. Change the first fixture text to contain a canonical term followed by its alias and then another entry:

```js
{ time: "00:07:46-00:08:05", speaker: "阿力", text: "国际教育也叫国际化教育，教育需要长期投入。", featured: true },
```

Change the second fixture text so both entries repeat in a later segment:

```js
{ time: "00:00:22-00:00:26", speaker: "张琳", text: "后面再说国际化教育和教育。" },
```

Update the first segment assertion to require only the first canonical match
and the different `教育` entry to remain interactive:

```js
assert.deepEqual(
  context.data.nativeProgram.transcript[0].contentNodes.map((node) => [node.type, node.text, node.term || ""]),
  [
    ["dictionary", "国际教育", "国际教育"],
    ["text", "也叫国际化教育，", ""],
    ["dictionary", "教育", "教育"],
    ["text", "需要长期投入。", ""]
  ]
);
```

Update the second segment assertion:

```js
assert.deepEqual(context.data.nativeProgram.transcript[1].contentNodes, [
  { type: "text", text: "后面再说国际化教育和教育。" }
]);
```

Add a fresh-normalization assertion by calling `loadNativeProgram` again with
the same fixture and confirming the first segment still begins with a
dictionary node. This proves seen state is not persisted across program loads.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test --test-name-pattern="webview native program detail page keeps program, book, and topic details" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL because the alias and later repeated terms are still emitted as dictionary nodes.

- [ ] **Step 3: Implement the per-transcript seen-entry set**

Change the node builder signature:

```js
function buildTranscriptDictionaryNodes(value, entries, seenEntryIds) {
```

Inside the match branch, retain cursor advancement for every match but emit
only unseen entries as dictionary nodes:

```js
if (matched) {
  if (!seenEntryIds.has(matched.entry.id)) {
    nodes.push({
      type: "dictionary",
      text: matched.matchText,
      entryId: matched.entry.id,
      term: matched.entry.term
    });
    seenEntryIds.add(matched.entry.id);
  } else {
    const previous = nodes[nodes.length - 1];
    if (previous && previous.type === "text") previous.text += matched.matchText;
    else nodes.push({ type: "text", text: matched.matchText });
  }
  cursor += matched.matchText.length;
  continue;
}
```

Create the set once per transcript normalization and pass it to every segment:

```js
function normalizeTranscript(value, dictionaryEntries) {
  const seenEntryIds = new Set();
  return Array.isArray(value)
    ? value
      .map((item) => {
        // existing field normalization remains unchanged
        return {
          // existing fields remain unchanged
          contentNodes: buildTranscriptDictionaryNodes(text, dictionaryEntries, seenEntryIds),
          // existing fields remain unchanged
        };
      })
      .filter((item) => item.text)
    : [];
}
```

- [ ] **Step 4: Run focused and full mini-program verification**

Run:

```bash
node --test --test-name-pattern="webview native program detail page keeps program, book, and topic details" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git diff --check
```

Expected: focused test passes; full file reports zero failures; diff check exits 0.

- [ ] **Step 5: Commit only this task's incremental hunks**

Before editing, save copies of both dirty files under `.superpowers/sdd/`.
After verification, generate patches between those copies and the completed
files, inspect that they contain only dictionary fixture/assertion and
seen-entry changes, then apply only those patches to the Git index. Do not stage
the pre-existing timestamp normalization hunks.

Commit:

```bash
git commit -m "fix: highlight dictionary entries once"
```

Expected: the commit contains only the first-highlight implementation and its
tests; the unrelated timestamp-range changes remain unstaged in the working
tree.

