# Module: Backend API

## FOR

- Express API routes, controllers, middleware, models, and services.
- Authentication, user state, billing/Pro points, AI routing, guest/program
  data, uploads endpoints, and integrations.
- Backend tests using Node's test runner with `tsx`.

## NOT FOR

- Frontend presentation decisions.
- Production secrets or `.env` values.
- Runtime uploaded media lifecycle beyond API paths and storage contracts.
- Deployment orchestration outside backend readiness requirements.

## Components

- `backend/src/routes/`
- `backend/src/controllers/`
- `backend/src/services/`
- `backend/src/models/`
- `backend/src/middlewares/`
- `backend/src/utils/`
- `backend/package.json`

## Evolution

### Durable Contracts

- Mobile invite gating is enforced in the backend before new-user creation.
  Admin `SystemSetting` config now controls the active code, activation limit,
  used count, and expiry time. `LOGIN_INVITE_CODE` and
  `LOGIN_INVITE_ACTIVATION_LIMIT` are fallback defaults when no admin config
  has been saved.

### Active

- XF-003 - Decide whether the WeKnora global RAG plan is still active and, if
  active, keep backend routing and service changes test-first.

### Deferred / Obsolete

- Document durable API contracts in this module doc as they stabilize.
