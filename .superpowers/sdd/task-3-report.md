# Task 3 Report: Selectable content link and proof submission

## Status

Implemented and committed as `5f1ced5f feat(frontend): add mama task proof submission`.

## RED / GREEN

- RED: Added source tests for the selectable private content-link dialog and proof upload/submission. The focused suite failed 2 tests because the dialog copy, selectable URL, proof fields, and submission binding were absent.
- GREEN: Added the minimal page state and handlers. The focused suite then passed all 17 tests.

## Changed files

- `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- `frontend/src/pages/MamaResourceApplyPage.tsx`
- `docs/ACTIVE_CONTEXT.md`

The detail view now initializes proof fields from the selected task, exposes a non-navigating in-page content-link dialog only for a non-empty `contentUrl`, uploads screenshots through `uploadMamaResourceScreenshot`, and submits through `submitMamaResourceTaskProof`. While upload or submission is active, duplicate actions are disabled. Errors retain both proof fields. A successful submission replaces the selected detail task and its matching list entry.

## Verification

- `/Users/xuduoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`: PASS, 17/17.
- `npm run build` from `frontend/`: PASS (`tsc` and Vite build exited 0). Vite retained its existing large-chunk warning.
- `git diff --check`: PASS before commit.

## Self-review

- No iframe, anchor navigation, `window.open`, or location assignment was added for Feishu/content URLs.
- The URL block uses selectable text and wraps long URLs.
- The overlay and explicit close control both dismiss the dialog; clicking inside the card does not.
- Upload and submit failures only update their local error state, leaving entered link and uploaded screenshot URL intact.
- The build-generated screen CSS was restored so the commit contains only Task 3's named project files.

## Visual verification

Not completed. The approved-account home, assigned task detail, and private link dialog require a real authenticated approved profile/task response. No authenticated fixture was available in this task, and fake authenticated data was explicitly avoided. No screenshot is claimed.

## Remaining concerns

- Runtime API success/error behavior and mobile visual hierarchy still need verification with a real approved account and assigned task containing `contentUrl`.
- Git commands emit repeated warnings for malformed macOS AppleDouble `._pack-*.idx` files in the shared object store. They did not prevent the focused tests, build, diff check, restore, or commit, but repository maintenance should remove that Git object-store noise separately.

## Review fix: async task isolation and modal accessibility

### RED / GREEN

- RED: Added a pure identity-guard behavioral test covering task A versus task B, plus focused source coverage for async guard placement and modal focus/keyboard behavior. The suite failed 2 tests because the guard and accessibility behavior did not exist.
- GREEN: Added `isSameTaskIdentity`, tracked the currently selected task in a ref, and captured the initiating identity for proof upload/submission. Upload success/error and submission detail fields/messages now update only when the initiating task remains selected. Submission success still replaces the matching list item after navigation. Added modal initial focus, document-level Escape dismissal, Tab focus containment, and focus restoration to the content-link opener. The focused suite passed 19/19.

### Additional changed files

- `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- `frontend/src/pages/MamaResourceApplyPage.tsx`
- `docs/ACTIVE_CONTEXT.md`

`docs/ACTIVE_CONTEXT.md` now explicitly lists mobile Web authenticated runtime and visual review in the Mama Haozhuan waiting condition.

### Verification

- `/Users/xuduoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`: PASS, 19/19.
- `npm run build` from `frontend/`: PASS (`tsc` and Vite build exited 0); the existing large-chunk warning remains.

### Review-fix self-review

- A late upload result cannot replace task B's screenshot, error, or success message.
- A late submit result updates task A in the list but cannot replace task B's detail, proof fields, error, or success message.
- Closing by overlay, close button, or Escape uses the same close state and returns focus to the opener.
- While the modal is open, captured Tab/Shift+Tab stays on its only interactive control, so background controls are not keyboard reachable.
- Authenticated runtime and visual verification remain unperformed; no screenshot is claimed.
