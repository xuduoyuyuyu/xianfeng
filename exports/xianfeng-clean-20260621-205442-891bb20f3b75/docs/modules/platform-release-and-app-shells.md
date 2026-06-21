# Module: Platform, Release, And App Shells

## FOR

- Docker compose, deploy scripts, release scripts, and local runtime helpers.
- GitHub Actions deployment entrypoints.
- Capacitor app shell and WeChat mini-program shell projects.
- Release safety rules for uploads, secrets, environment files, and clean export.

## NOT FOR

- Product feature implementation that belongs in `frontend/` or `backend/`.
- Production data mutation without explicit approval.
- Committing generated native build outputs or dependency directories.

## Components

- `scripts/release/`
- `scripts/deploy/`
- `scripts/local/`
- `deploy/`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.github/workflows/`
- `apps/mobile/`
- `apps/wechat-miniprogram/`
- `RELEASE_GUIDE.md`
- `RELEASE_CLEAN_FLOW.md`

## Evolution

### Active

- XF-002 - Keep deployment instructions centralized and preserve runtime data
  and secrets during sync/deploy workflows.

### Deferred / Obsolete

- Add app-store/TestFlight or WeChat release roadmap items only when those
  workflows become active.
