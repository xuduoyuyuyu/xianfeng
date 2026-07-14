# Mama Resource Alipay Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add required Alipay account and verified-name fields to Mama Haozhuan profiles across backend, admin, mobile Web, and native mini program.

**Architecture:** Store `alipayAccount` and `alipayVerifiedName` as optional-compatible top-level profile fields while enforcing both on every user application and admin edit. Carry the same field names through API types and each form; keep public task data unchanged.

**Tech Stack:** Express, Mongoose, TypeScript, React/Vite, WeChat Mini Program, Node.js test runner.

## Global Constraints

- New applications and profile edits require both trimmed values.
- Existing database records without the fields remain readable; no production migration.
- Do not modify the existing media-account `realNameVerified` meaning.
- Do not validate whether the Alipay account is a phone number or email.
- Full payment details appear only in the user's own authenticated profile responses and admin responses.

---

### Task 1: Backend model and API validation

**Files:**
- Modify: `backend/src/models/MamaResourceProfile.ts`
- Modify: `backend/src/routes/mamaResource.ts`
- Modify: `backend/src/routes/adminMamaResource.ts`
- Modify: `backend/src/routes/mamaResource.test.ts`

**Interfaces:**
- Produces profile fields: `alipayAccount?: string`, `alipayVerifiedName?: string`
- User application consumes both fields as strings.
- Admin update consumes both fields together and rejects either trimmed-empty value.

- [ ] Write failing route tests for missing account, missing verified name, trimmed persistence, historical records without fields, and admin edit validation.
- [ ] Run `cd backend && node --test --import tsx src/routes/mamaResource.test.ts` and verify the new assertions fail.
- [ ] Add optional-compatible schema/interface fields, application validation and payload persistence, and admin edit validation/persistence.
- [ ] Run the targeted backend test and verify all cases pass.
- [ ] Commit with `git commit -m "feat(backend): store Mama Resource Alipay profile"`.

### Task 2: Shared API contract and mobile Web form

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Modify: `frontend/src/pages/MamaResourceApplyPage.test.mjs`

**Interfaces:**
- `MamaResourceProfile` and `MamaResourceApplicationInput` expose both strings.
- `FormState` owns `alipayAccount` and `alipayVerifiedName`.

- [ ] Add failing static tests proving profile hydration, two labeled inputs, required pre-submit checks, and payload fields.
- [ ] Run `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs` and verify RED.
- [ ] Add the fields to API types, empty/default/hydrated form state, submit validation, and request payload. Render both inputs after contact fields and before media accounts.
- [ ] Run the focused test and `cd frontend && npm run build`; verify both pass.
- [ ] Commit with `git commit -m "feat(frontend): collect Mama Resource Alipay profile"`.

### Task 3: Native mini-program form

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

**Interfaces:**
- Page state owns `alipayAccount` and `alipayVerifiedName`.
- Submission payload sends the same two keys.

- [ ] Add failing tests for profile hydration, input bindings, missing-field validation messages, draft preservation, and payload fields.
- [ ] Run `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs` and verify RED.
- [ ] Add default/draft/profile mapping, input handlers, WXML fields, trim-and-require validation, and payload persistence.
- [ ] Remove generated AppleDouble files, then run the focused test and `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`.
- [ ] Commit with `git commit -m "feat(miniprogram): collect Mama Resource Alipay profile"`.

### Task 4: Admin display and editing

**Files:**
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs`

**Interfaces:**
- Consumes full values from `MamaResourceProfile`.
- Sends both fields through `adminApi.updateMamaResource`.
- Produces list-only masked account text.

- [ ] Add failing tests for masked list rendering, full detail form values, required edit validation, and update payload.
- [ ] Run `node --test frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs` and verify RED.
- [ ] Add a focused masking helper, list summary, detail inputs, validation, and update payload without changing neighboring admin workflow.
- [ ] Run the focused test and `cd frontend && npm run build`.
- [ ] Commit with `git commit -m "feat(admin): manage Mama Resource Alipay profile"`.

### Task 5: Final cross-surface verification

**Files:** Verify only.

- [ ] Run backend targeted tests, both frontend page tests, mini-program form tests, full mini static tests, and frontend production build.
- [ ] Run `git diff --check main...HEAD` and inspect that no public task serializer or unrelated media verification field changed.
