import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixturesDir = path.join(root, 'fixtures');
const manifest = JSON.parse(await fs.readFile(path.join(fixturesDir, 'corpus-manifest.json'), 'utf8'));
const expected = JSON.parse(await fs.readFile(path.join(fixturesDir, 'expected.json'), 'utf8'));

async function listFiles(dir) {
  const out = [];
  const walk = async (current, prefix) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  await walk(dir, '');
  return out.sort();
}

test('every corpus fixture has a manifest entry and vice versa', async () => {
  const dirs = (await fs.readdir(fixturesDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name);
  for (const name of Object.keys(manifest.fixtures)) {
    assert.ok(dirs.includes(name), `manifest fixture ${name} missing on disk`);
  }
  for (const name of dirs) {
    if (Object.hasOwn(manifest.fixtures, name)) continue;
    assert.ok(!name.startsWith('real-'), `corpus-style fixture ${name} missing from manifest`);
  }
});

test('manifest sources pin an https repo, a full commit SHA and a license', () => {
  for (const [alias, source] of Object.entries(manifest.sources)) {
    assert.match(source.repo, /^https:\/\//, `${alias} repo must be an https URL`);
    assert.match(source.commit, /^[0-9a-f]{40}$/, `${alias} must pin a full commit SHA`);
    assert.ok(source.license, `${alias} must name a license`);
  }
});

test('manifest fixture files match the snapshot on disk exactly', async () => {
  for (const [name, entry] of Object.entries(manifest.fixtures)) {
    assert.ok(Object.hasOwn(manifest.sources, entry.source), `${name} names an unknown source`);
    assert.ok(entry.note, `${name} needs a review note`);
    const actual = await listFiles(path.join(fixturesDir, name));
    assert.deepEqual(actual, [...entry.files].sort(), `${name} files differ from the manifest`);
  }
});

test('every corpus fixture has an expected.json entry', () => {
  for (const name of Object.keys(manifest.fixtures)) {
    assert.ok(Object.hasOwn(expected, name), `${name} missing from expected.json`);
  }
});
