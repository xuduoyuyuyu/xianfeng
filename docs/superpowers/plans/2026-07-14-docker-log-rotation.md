# Docker Log Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap every Xianfeng container's Docker logs at three 20 MB files and deploy the policy safely to production.

**Architecture:** Define one YAML extension in the base Compose file and merge it into every service's `logging` field. A focused Node test renders the merged Compose model as JSON and verifies every declared service inherits the exact policy before the existing release workflow recreates production containers.

**Tech Stack:** Docker Compose, YAML anchors/merge keys, Node.js built-in test runner, production SSH/rsync release workflow.

## Global Constraints

- Use Docker's `json-file` logging driver.
- Set `max-size` to exactly `20m` and `max-file` to exactly `3`.
- Apply the policy to every Xianfeng service, including optional `weknora` profile services.
- Do not modify Docker daemon-wide settings, database volumes, uploads, secrets, environment files, backups, release archives, or exports.
- Expect only a brief container recreation window; verify production health immediately afterward.

---

### Task 1: Versioned Compose Log Policy

**Files:**
- Modify: `docker-compose.yml`
- Create: `scripts/release/docker-log-rotation.test.mjs`

**Interfaces:**
- Consumes: Docker Compose's `config --format json` output.
- Produces: an `x-json-logging` YAML extension and a resolved `logging` object on every service with `driver: json-file`, `options.max-size: 20m`, and `options.max-file: "3"`.

- [ ] **Step 1: Write the failing structural test**

Create `scripts/release/docker-log-rotation.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('every compose service uses the bounded json-file logging policy', () => {
  const rendered = execFileSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'],
    { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
  );
  const compose = JSON.parse(rendered);
  const services = Object.entries(compose.services);

  assert.ok(services.length > 0);
  for (const [name, service] of services) {
    assert.deepEqual(service.logging, {
      driver: 'json-file',
      options: { 'max-file': '3', 'max-size': '20m' },
    }, `${name} must use the shared bounded logging policy`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test scripts/release/docker-log-rotation.test.mjs
```

Expected: FAIL because current services have no resolved `logging` configuration.

- [ ] **Step 3: Add the minimal shared policy**

Add this extension above `services:` in `docker-compose.yml`:

```yaml
x-json-logging: &json-logging
  driver: json-file
  options:
    max-size: "20m"
    max-file: "3"
```

Add this block to each service in `docker-compose.yml`:

```yaml
    logging: *json-logging
```

Apply it to `mongo`, `backend`, `frontend`, `gateway`, `weknora-app`, `weknora-ui`, `weknora-docreader`, `weknora-postgres`, and `weknora-redis`.

- [ ] **Step 4: Run focused and Compose validation**

Run:

```bash
node --test scripts/release/docker-log-rotation.test.mjs
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
git diff --check
```

Expected: the test passes, Compose exits 0 without output, and `git diff --check` exits 0.

- [ ] **Step 5: Commit the policy**

```bash
git add docker-compose.yml scripts/release/docker-log-rotation.test.mjs
git commit -m "ops: bound docker container logs"
```

### Task 2: Freeze, Deploy, and Verify Production

**Files:**
- Modify if generated: `.release/current.lock`

**Interfaces:**
- Consumes: the committed Compose logging policy from Task 1.
- Produces: production containers whose inspected Docker log configuration matches the policy while preserving all runtime mounts and data.

- [ ] **Step 1: Run the release guardrails**

Run:

```bash
node --test scripts/release/docker-log-rotation.test.mjs
bash scripts/release/verify-mini-webview-ready.sh
bash scripts/release/freeze-current.sh
```

Expected: focused test and release suite pass; the lock reports the current commit.

- [ ] **Step 2: Commit a changed freeze lock if necessary**

If `.release/current.lock` changed:

```bash
git add .release/current.lock
git commit -m "chore: freeze docker log rotation release"
bash scripts/release/freeze-current.sh
```

Expected: the final lock names the final release commit. If it did not change, do not create an empty commit.

- [ ] **Step 3: Push and sync the frozen source**

Run:

```bash
git push origin main
rsync -az --delete \
  --exclude '._*' --exclude .git --exclude .worktrees/ --exclude .superpowers/ \
  --exclude apps/mobile/ --exclude node_modules --exclude backend/node_modules \
  --exclude frontend/node_modules --exclude backend/uploads/ --exclude uploads/ \
  --exclude backend/secrets/ --exclude .env --exclude .env.production \
  --exclude backend/.env --exclude releases/ --exclude exports/ --exclude backups/ \
  --exclude data/ --exclude frontend/dist/ --exclude frontend/.vite/ \
  ./ root@14.103.106.216:/opt/xianfeng/
```

Expected: push and rsync exit 0 without transferring excluded runtime data.

- [ ] **Step 4: Recreate production containers**

Run:

```bash
ssh root@14.103.106.216 \
  "cd /opt/xianfeng && docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans"
```

Expected: frontend, backend, gateway, and Mongo are recreated or confirmed current and end in `Started`/`Running` state.

- [ ] **Step 5: Verify live logging policy and health**

Run:

```bash
ssh root@14.103.106.216 '
  for name in xianfeng_frontend xianfeng_backend xianfeng_gateway xianfeng_mongo; do
    docker inspect -f "{{.Name}} {{.HostConfig.LogConfig.Type}} {{index .HostConfig.LogConfig.Config \"max-size\"}} {{index .HostConfig.LogConfig.Config \"max-file\"}}" "$name"
  done
  docker ps --format "table {{.Names}}\t{{.Status}}"
  df -h /
'
curl -fsS -o /dev/null https://xianfeng.xinzhi.info/
curl -fsS -o /dev/null https://xianfeng.xinzhi.info/api/programs
```

Expected: all four inspect lines end with `json-file 20m 3`; all containers are running; both HTTP checks exit 0; disk remains safely below the prior 96% level.

