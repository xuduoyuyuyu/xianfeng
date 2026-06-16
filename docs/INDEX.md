# Documentation Index

This index maps the repository source of truth for AI-assisted development.

## Decisions

- [ADR-001: Repository Boundary](decisions/ADR-001-repository-boundary.md)

## Modules

- [Frontend Web](modules/frontend-web.md)
- [Backend API](modules/backend-api.md)
- [Platform, Release, And App Shells](modules/platform-release-and-app-shells.md)

## Roadmap

- [Roadmap Overview](roadmap/README.md)
- [Active Roadmap](roadmap/active-roadmap.md)
- [Deferred Roadmap](roadmap/deferred/README.md)
- [Obsolete Roadmap](roadmap/obsolete/README.md)

## AI Context

- [Active Context](ACTIVE_CONTEXT.md)
- [Agent Rules](../AGENTS.md)

## Operational Docs

- [Release Guide](../RELEASE_GUIDE.md)
- [Release Clean Flow](../RELEASE_CLEAN_FLOW.md)
- [Deploy Readme](../README_DEPLOY.md)
- [WeKnora Global RAG Plan](superpowers/plans/2026-06-06-weknora-global-rag.md)

## Traceability

| Capability | Component | ADR | Roadmap |
| --- | --- | --- | --- |
| Public web and admin experience | `frontend/` | ADR-001 | XF-001 |
| API, auth, billing, AI, uploads | `backend/` | ADR-001 | XF-001 |
| Release, deployment, and app shells | `scripts/`, `deploy/`, `apps/`, `.github/` | ADR-001 | XF-002 |
| Shared WeKnora retrieval context | `backend/src/services/`, `backend/src/routes/` | ADR-001 | XF-003 |
