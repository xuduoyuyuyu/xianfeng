# Login Invite Cookie Design

Date: 2026-06-17

## Goal

After a user successfully calibrates the login invite code once, the browser
should remember that result and stop showing the invite-gate UI on every login.
The user should go straight to SMS login on later visits. This only removes the
repeated frontend step; backend invite enforcement for genuinely new
registrations remains unchanged.

## Scope

- React login surfaces:
  - `frontend/src/components/LoginRequiredModal.tsx`
  - `frontend/src/components/InlineLoginForm.tsx`
  - `frontend/src/pages/UserLoginPage.tsx`
- Static wel login surfaces:
  - `frontend/public/wel/login.html`
  - `frontend/public/wel/index.html`
- Existing backend invite validation remains the source of truth.

## Proposed Behavior

### Stored state

- Store the last successfully verified invite code in a browser cookie.
- Use one shared cookie name across all login surfaces in this repo.
- The cookie value is the verified invite code itself because later SMS-send and
  mobile-login requests must continue sending the code back to the backend.
- The cookie gets a finite lifetime so it survives page refreshes and later
  visits, but can naturally expire without backend changes.

### Initial render

- On load, each login surface checks the invite cookie.
- If the cookie exists, hide the invite calibration entry by default and show
  the phone + SMS login form directly.
- If the cookie does not exist, keep today’s invite-first entry flow:
  the user sees the invite input and must calibrate before phone fields appear.

### Invite calibration

- Manual calibration still uses the existing backend verify endpoint.
- On verify success:
  - save the verified invite code into the shared cookie
  - hide the invite entry
  - reveal the phone + SMS login fields
- The visible success state can stay lightweight; it should not continue to ask
  the user to re-enter the code in the same browser.

### SMS send and login submit

- When the invite cookie exists, SMS-send and mobile-login requests use the
  stored code automatically.
- If the user is currently typing a new invite code manually, the in-memory
  verified/manual value wins for that attempt; after success it replaces the
  cookie.

### Recovery when cookie becomes stale

- If backend returns an invite-related failure such as:
  - incorrect code
  - expired code
  - activation limit exhausted
- then the frontend must:
  - delete the stored invite cookie
  - clear the local verified-invite state
  - show the invite calibration entry again
  - surface the backend error text

This lets admin-side invite changes revoke old remembered values without adding
new backend endpoints.

## Approach Options

### Option A: Shared cookie helper in React + small duplicated helpers in static pages

- Add a tiny cookie utility for React login components.
- Add equivalent plain-JS cookie helpers inside the two static wel pages.
- Keep behavior aligned through tests.

Recommendation: use this option. It is the smallest change that covers both the
React app and the static login pages without refactoring unrelated auth code.

### Option B: Move invite memory to localStorage

- Easier to read/write than cookies.
- Not requested, and inconsistent with the stated “cookie remember” behavior.

Not recommended.

### Option C: Add backend session persistence for invite verification

- Stronger control across devices.
- Much larger scope and changes the current temporary invite design.

Not recommended.

## Component Changes

### Frontend React

- Reintroduce invite-gated UI state, but initialize it from the shared cookie
  instead of defaulting to “unverified every time”.
- Add a small helper module for:
  - read invite cookie
  - write invite cookie
  - clear invite cookie
- Use the stored verified code automatically for:
  - `userApi.sendMobileCode(...)`
  - `loginByMobile(...)`
- On invite-related backend failure, clear cookie and return the UI to
  invite-calibration mode.

### Static wel pages

- Add the same cookie read/write/clear logic inline.
- On load, if cookie exists, hide the invite entry and expose SMS login fields
  directly.
- Reuse the stored code for `/api/sms/send-code` and `/api/auth/mobile`.
- On invite-related backend failure, clear the cookie and show the invite entry.

### Backend

- No contract change required.
- Existing verify/send/login behavior remains authoritative.
- Existing-user bypass and new-user invite enforcement stay as-is.

## Error Handling

- Non-invite errors such as bad phone number, invalid SMS code, rate limit, or
  SMS provider failure must not clear the invite cookie.
- Only backend invite-related failures should force the UI back to calibration.
- If the cookie is malformed or empty, treat it as absent.

## Testing

- Update frontend string/behavior tests to cover:
  - cookie-backed verified state path
  - clearing cookie on invite-related backend failures
  - continued use of stored code for SMS send and login submit
- Update static-page tests by source inspection to confirm:
  - cookie read/write/clear helpers exist
  - stored code is sent with SMS/login requests
  - stale cookie path restores the invite UI
- Keep existing backend invite tests unless implementation reveals a real
  backend gap.

## Out of Scope

- Cross-device remembered verification
- Admin UI changes for invite management
- Changing invite quota semantics
- Refactoring broader auth state or replacing existing login screens
