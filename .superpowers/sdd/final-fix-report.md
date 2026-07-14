# Final Review Fix Report

## What changed

- Split task identity semantics: template identity is used for claim/dedupe; assignment `_id` is used for proof submission.
- Guarded late claim success/error by the template identity that initiated the request. List replacement still applies to task A, while selected detail/proof state only changes if A remains selected.
- Added request generation plus auth-token identity checks around profile/task loading. Stale success, 401, and error responses are discarded; private task state is cleared and hidden while auth identity changes.
- Removed the extra blank line at the plan file EOF.

## RED

Command:

`node --test src/pages/MamaResourceApplyPage.test.mjs`

Observed: 22 tests, 17 passed, 5 failed. The failures were the missing `templateTaskIdentity`, `assignmentTaskIdentity`, `shouldApplyTaskDetailResult`, and `isCurrentProfileTaskRequest` behavior plus the old claim call contract.

A later focused RED check caught that a current non-401 load error would remain behind the loading gate: 22 tests, 21 passed, 1 failed.

## GREEN and verification

- `node --test src/pages/MamaResourceApplyPage.test.mjs`: 22 passed, 0 failed.
- `npm run build`: exit 0; Tailwind screen builds, `tsc`, and Vite production build completed. Vite retained the existing large-chunk warning.
- Build-generated `frontend/public/screens/admin.css` and `frontend/public/screens/public.css` were restored and are not part of this change.

## Files

- `frontend/src/pages/MamaResourceApplyPage.tsx`
- `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- `docs/superpowers/plans/2026-07-14-mama-resource-mobile-task-management.md`
- `.superpowers/sdd/final-fix-report.md`

## Self-review

- Verified backend contract in `backend/src/routes/mamaResource.ts`: claim queries `MamaResourceTask` by template route ID; submission updates `MamaResourceTaskAssignment` by route ID and approved profile ID.
- Identity helpers are exercised with `{ _id: "assignment-a", taskId: "template-a" }`; the assignment helper returns `assignment-a`, and the production proof call uses that helper.
- Claim and load guards are executable pure-helper tests, not only source-shape checks.
- Changes are limited to the reviewed page, its focused test, and requested plan/report files.

## Not verified / remaining gap

- No authenticated browser/mobile runtime or screenshot verification was run. The remaining gap is end-to-end visual/runtime confirmation with real login, overlapping network timing, claim, upload, and proof submission against a running backend.
- No backend code changed, so no backend test suite was run.
- Git emits pre-existing `non-monotonic index` warnings for AppleDouble `._pack-*.idx` files, but the focused test/build commands completed successfully.

## Final re-review privacy race

### RED

Added an executable auth-mutation guard test modeling account A `{ generation: 1, authIdentity: "token-a" }` followed by account B `{ generation: 2, authIdentity: "token-b" }` and coverage assertions for all five authenticated mutation paths.

`node --test src/pages/MamaResourceApplyPage.test.mjs`: 23 tests, 22 passed, 1 failed because `isCurrentAuthMutation` and per-path mutation captures were absent.

### GREEN

- Added a dedicated auth mutation generation, invalidated on every auth transition.
- Claim, proof screenshot upload, proof submission, profile screenshot upload, and profile/application submit now guard success, error, and finally mutations against their initiating auth generation and identity.
- Auth transitions reset task/proof/profile operation flags, errors, messages, proof fields, selected task, and private task lists. Late account-A callbacks cannot write account-B state, including when both accounts act on the same template ID.
- `node --test src/pages/MamaResourceApplyPage.test.mjs`: 23 passed, 0 failed.
- `./node_modules/.bin/tsc --noEmit`: exit 0.
- `npm run build`: exit 0; existing Vite large-chunk warning only. Generated screen CSS restored after the build.

### Remaining verification gap

The focused harness executes the guard behavior and verifies every mutation path uses it, but does not mount React with deferred promises. A signed-in browser test that switches accounts while each request is in flight remains the end-to-end runtime gap.

Final self-review tightened invalidation from effect-time to render-time: when Redux presents a new auth identity, `authMutationRef` advances synchronously during render, closing the render-to-effect microtask window before any old promise callback can write. The final fresh verification remained 23/23 tests, `tsc --noEmit` exit 0, and `npm run build` exit 0.
