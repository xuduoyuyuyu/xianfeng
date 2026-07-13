# Mini Program Canonical Program Guests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a mini-program program detail displays only valid Knowledge Base guest bindings when they exist, while preserving legacy guest fallback for programs without valid bindings.

**Architecture:** Keep `normalizeProgramGuests()` as the sole mini-program guest normalization boundary. Build and validate binding guests first; select either that canonical list or the legacy `guests`/`guest` candidates, never both, then reuse the existing deduplication, avatar, and copy normalization.

**Tech Stack:** WeChat Mini Program JavaScript, Node.js built-in test runner, repository release verification scripts.

## Global Constraints

- Only change the native mini-program program detail guest candidate source.
- A valid binding guest has an ID or a non-empty name.
- If at least one valid binding guest exists, ignore top-level `guests` and `guest` completely.
- If no valid binding guest exists, preserve top-level `guests` and `guest` as legacy fallback.
- Do not change backend APIs, production data, transcript behavior, or other pages.

---

### Task 1: Prefer Canonical Guest Bindings

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15247-15285,15759-15775`
- Modify: `apps/wechat-miniprogram/pages/webview/index.js:281-315`

**Interfaces:**
- Consumes: a program detail object with `guestBindings`, optional `guests`, and optional legacy `guest`.
- Produces: `normalizeProgramGuests(item): Array<{ id, name, title, bio, avatar, avatarFallback }>`.
- Preserves: guest order, deduplication, avatar fallback, guest switching, profile navigation, and return-wish behavior.

- [ ] **Step 1: Write a failing canonical-source regression test**

In the existing native program detail fixture, add one invalid binding and change the legacy guest to a distinct non-database snapshot:

```js
guestBindings: [
  {
    guestId: "missing-expert",
    order: 0,
    role: "嘉宾",
    guest: null
  },
  // keep the existing expert-1 and expert-2 valid bindings
],
guest: {
  name: "历史快照嘉宾",
  title: "旧资料",
  bio: "该嘉宾不在先疯智库。",
  avatar: "/wel/assets/wel-avatar/no-hat.png"
}
```

Keep the existing canonical assertion and add an explicit rejection assertion:

```js
assert.equal(context.data.nativeProgram.guests.length, 2);
assert.deepEqual(context.data.nativeProgram.guests.map((guest) => guest.name), ["刘美文", "王璇"]);
assert.equal(
  context.data.nativeProgram.guests.some((guest) => guest.name === "历史快照嘉宾"),
  false
);
```

Add a source-level assertion that locks in the legacy fallback branch:

```js
assert.match(
  js,
  /const bindingGuests = bindings[\s\S]*const candidates = bindingGuests\.length[\s\S]*\? bindingGuests[\s\S]*:\s*\[\]\.concat\(Array\.isArray\(source\.guests\) \? source\.guests : \[\]\)[\s\S]*\.concat\(source\.guest \|\| \[\]\)/
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL because the current implementation appends the distinct legacy snapshot and returns three guests.

- [ ] **Step 3: Select one guest source before normalization**

Replace the unconditional merged candidates in `normalizeProgramGuests()` with canonical selection:

```js
function normalizeProgramGuests(item) {
  const source = item || {};
  const bindings = Array.isArray(source.guestBindings)
    ? source.guestBindings.slice().sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    : [];
  const bindingGuests = bindings
    .map((binding) => binding && binding.guest)
    .filter((guest) => {
      const value = guest || {};
      return Boolean(firstText([value._id, value.id, value.slug, value.name], ""));
    });
  const candidates = bindingGuests.length
    ? bindingGuests
    : [].concat(Array.isArray(source.guests) ? source.guests : []).concat(source.guest || []);
  const seen = new Set();
  return candidates
    .map((value) => {
      const guest = value || {};
      const id = firstText([guest._id, guest.id, guest.slug], "");
      const name = firstText([guest.name], "");
      if (!id && !name) return null;
      const key = id || name.toLowerCase().replace(/\s+/g, "");
      if (!key || seen.has(key)) return null;
      seen.add(key);
      const avatar = resolveNativeGuestAvatar(guest.avatar);
      return {
        id,
        name: name || "节目特邀嘉宾",
        title: firstText([guest.title], "教育与成长观察者"),
        bio: firstText([guest.bio], "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角。"),
        avatar: avatar.src,
        avatarFallback: avatar.isFallback
      };
    })
    .filter(Boolean);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS with two canonical guests; the invalid binding and legacy snapshot are absent.

- [ ] **Step 5: Run the full mini-program verification**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
bash scripts/release/verify-mini-webview-ready.sh
git diff --check
```

Expected: all mini-program tests, WeChat backend helper tests, frontend build, and whitespace validation succeed.

- [ ] **Step 6: Verify the exact production-backed route in WeChat DevTools**

Open program code `69aff365f3a969043874a66e` (《052.孩子的音乐天赋是如何被“浪费”的？》). Confirm only the Knowledge Base guest “平由植” is shown, the “平由植老师” legacy pill is absent, and the remaining guest card/profile interaction still works.

Expected: one guest card, no guest switcher, and no legacy snapshot.

- [ ] **Step 7: Commit the focused implementation**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: prefer canonical program guests"
```
