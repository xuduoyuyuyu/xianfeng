# ADR-001: Repository Boundary

Status: proposed

Date: 2026-06-16

## Context

`xianfeng` combines a public/admin web product, an Express API, release and
deployment scripts, and app shell projects. The repository also sits on a macOS
volume that can generate AppleDouble sidecar files, while runtime uploads and
secrets must stay outside tracked release content.

Without a written boundary, agents can confuse code release content with
runtime data, duplicate release instructions, or scatter future plans outside a
single roadmap.

## Decision

This repository is FOR:

- The React/Vite web frontend in `frontend/`.
- The Express/Mongoose backend API in `backend/`.
- Deployment, release, local runtime, and clean export scripts in `scripts/`,
  `deploy/`, `docker-compose*.yml`, and `.github/`.
- Mobile and WeChat mini-program shell projects in `apps/`.
- Governance docs under `docs/`.

This repository is NOT FOR:

- Production secrets or local environment files.
- Runtime uploaded media under `backend/uploads/`.
- Production database contents.
- Generated build outputs, dependency directories, or AppleDouble metadata.
- A second task tracker that duplicates an external issue system.

## Consequences

- Governance docs should link to existing release docs rather than rewrite them.
- Durable future work belongs in `docs/roadmap/`, not ad hoc TODO files.
- Release and deploy changes must preserve `backend/uploads/`, secrets, and
  environment files unless a user explicitly approves otherwise.
- If app shell behavior starts owning product logic instead of wrapping the web
  product, this ADR should be revisited.
