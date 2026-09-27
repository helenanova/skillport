import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const bin = path.join(root, 'bin', 'skillport.js');
const fx = (name) => path.join(root, 'fixtures', name);

test('check on a valid fixture exits 0', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal')]);
  assert.match(stdout, /Result: PASS/);
});

test('check on a broken fixture exits 1 with the error named', async () => {
  await assert.rejects(
    run('node', [bin, 'check', fx('broken-reference-path')]),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /style-guide\.md/);
      assert.match(err.stdout, /Result: FAIL/);
      return true;
    },
  );
});

test('--json emits a parseable report', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal'), '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.skillName, 'valid-minimal');
});

test('--markdown emits a harness table', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal'), '--markdown']);
  assert.match(stdout, /\| Harness \| Mode \| Result \|/);
});

test('fixtures command runs the whole set', async () => {
  const { stdout } = await run('node', [bin, 'fixtures', '--json']);
  const reports = JSON.parse(stdout);
  assert.equal(reports.length, 10);
});

test('check without a path exits 2', async () => {
  await assert.rejects(run('node', [bin, 'check']), (err) => err.code === 2);
});
