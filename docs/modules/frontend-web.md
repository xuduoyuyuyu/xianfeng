# Module: Frontend Web

## FOR

- Public web pages and admin screens served from `frontend/`.
- React application routes, state, API clients, and user-facing UI behavior.
- Static screen previews and generated screen CSS under `frontend/public/screens`.
- Browser verification for visual, interaction, and routing changes.

## NOT FOR

- Backend API contracts beyond client usage.
- Production deployment orchestration.
- Runtime uploads storage.
- Native mobile or WeChat platform capabilities except web-view compatibility.

## Components

- `frontend/src/`
- `frontend/public/screens/`
- `frontend/scripts/`
- `frontend/package.json`
- `frontend/docs/`

## Evolution

### Active

- XF-001 - Keep public/admin web behavior stable while governance is introduced.

### Deferred / Obsolete

- Move detailed visual tuning workflows into `frontend/docs/` when they become
  durable cross-session procedures.
