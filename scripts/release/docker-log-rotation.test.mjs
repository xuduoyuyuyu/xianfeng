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
