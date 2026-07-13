# Docker Log Rotation Design

## Goal

Prevent Xianfeng production containers from filling the server disk with
unbounded Docker `json-file` logs while keeping the configuration versioned
with the application release.

## Scope

- Define one reusable Compose logging policy in `docker-compose.yml`.
- Apply it to every Xianfeng service, including services behind the optional
  `weknora` profile.
- Recreate the four currently running production containers so Docker applies
  the new logging configuration.

This change does not modify Docker daemon-wide settings, database volumes,
uploads, secrets, environment files, backups, release archives, or exports.

## Policy

All services use Docker's `json-file` logging driver with:

- `max-size: 20m`
- `max-file: 3`

Each container therefore retains at most approximately 60 MB of Docker log
files. The policy is declared once with a YAML extension and referenced by each
service to keep the values consistent.

## Deployment

1. Validate the merged Compose configuration locally.
2. Run the repository's relevant release checks.
3. Commit and push the configuration through the normal release flow.
4. Sync the frozen source to `/opt/xianfeng` without overwriting runtime data.
5. Run the production Compose `up -d --build --remove-orphans` command. Existing
   containers are recreated as required; named and bind-mounted data remains.

The container switch may cause a few seconds of service interruption.

## Verification

- `docker compose config` succeeds.
- Every running Xianfeng container reports `json-file`, `max-size=20m`, and
  `max-file=3` through `docker inspect`.
- Frontend, backend, gateway, and Mongo containers remain running.
- The public home page and `/api/programs` return HTTP 200.
- Disk usage remains below the pre-cleanup critical level.

## Rollback

Revert the Compose change and recreate the containers. Runtime data is not
altered by either applying or reverting the logging policy.
