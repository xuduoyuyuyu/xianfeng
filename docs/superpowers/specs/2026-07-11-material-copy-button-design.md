# Material Copy Button Design

## Goal

Update the copy-link action on learning-material cards in the mini-program webview so it visually matches the round purchase action shown on native reading cards.

## Scope

- Change only the material-card action rendered by `frontend/src/pages/MaterialsPage.tsx`.
- Keep the existing card click and copy-link behavior unchanged.
- Keep the normal browser action as the existing `打开资料` text button.
- In the mini-program webview, replace the purple `复制链接` pill with a round icon-only action.

## Visual Design

- Match the purchase action's circular footprint and lower-right placement.
- Use a pale-purple circular background beneath the icon.
- Render the supplied Tabler `unlink` SVG at 24 x 24, with `currentColor`, one-pixel stroke, round caps, and round joins.
- Use the existing purple accent for the icon so it stays consistent with the reading-card purchase action.
- Add an accessible label of `复制链接` because the visible text is removed in the mini-program variant.

## Implementation

- Branch the action markup by `miniProgramWebView`.
- Render a semantic `button` for the mini-program copy action and retain the current anchor for normal browsers.
- Use local utility classes in `MaterialsPage.tsx`; do not create a shared component or alter unrelated cards.

## Verification

- Extend the focused `MaterialsPage.test.mjs` assertions for the icon-only mini-program action, accessible label, supplied SVG path data, and unchanged browser action.
- Run the focused Materials page test.
- Run the frontend build.
- If the local page is available, visually inspect the mini-program webview-sized layout and confirm the action footprint and lower-right alignment.

## Non-goals

- No change to link-copy behavior, toast behavior, card layout, pagination, filters, or native reading cards.
- No shared button abstraction or broad styling cleanup.
