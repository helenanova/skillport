import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkSkill, applyBaseline } from '../src/index.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const bin = path.join(root, 'bin', 'skillport.js');
const fx = (name) => path.join(root, 'fixtures', name);

test('applyBaseline suppresses by rule and recounts the verdict', async () => {
  const report = await checkSkill(fx('broken-reference-path'));
  assert.equal(report.ok, false);
  const next = applyBaseline(report, [{ rule: 'ref-exists' }]);
  assert.equal(next.ok, true);
  assert.equal(next.summary.errors, 0);
  assert.equal(next.baselined.length, 1);
  assert.equal(next.baselined[0].rule, 'ref-exists');
  assert.equal(report.static.issues.length, 1); // original untouched
});

test('applyBaseline narrows by file and message substring', async () => {
  const report = await checkSkill(fx('broken-reference-path'));
  const miss = applyBaseline(report, [{ rule: 'ref-exists', file: 'other.md' }]);
  assert.equal(miss.ok, false);
  const hit = applyBaseline(report, [{ rule: 'ref-exists', file: 'SKILL.md', message: 'style-guide.md' }]);
  assert.equal(hit.ok, true);
});

test('a shared used set leaves unmatched entries stale', async () => {
  const report = await checkSkill(fx('broken-reference-path'));
  const used = new Set();
  const suppressions = [
    { rule: 'ref-exists' },
    { rule: 'no-such-rule' },
  ];
  applyBaseline(report, suppressions, used);
  assert.deepEqual([...used], [0]);
});

test('baseline never suppresses failing smoke steps', async () => {
  const report = await checkSkill(fx('broken-reference-path'), { harnesses: ['claude-code'] });
  const withStepFailure = {
    ...report,
    harnesses: {
      'claude-code': {
        ...report.harnesses['claude-code'],
        steps: [{ name: 'scripts', ok: false, detail: 'boom' }],
      },
    },
  };
  const next = applyBaseline(withStepFailure, [{ rule: 'ref-exists' }]);
  assert.equal(next.ok, false);
  assert.equal(next.harnesses['claude-code'].ok, false);
});

test('multi-skill check reports each skill and aggregates the exit code', async () => {
  await assert.rejects(
    run('node', [bin, 'check', fx('valid-minimal'), fx('broken-reference-path')]),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /portability report: valid-minimal/);
      assert.match(err.stdout, /portability report: broken-reference-path/);
      assert.match(err.stdout, /Overall: 1\/2 skills pass/);
      return true;
    },
  );
});

test('multi-skill check exits 0 when every skill passes', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal'), fx('valid-full')]);
  assert.match(stdout, /Overall: 2\/2 skills pass/);
});

test('multi-skill --json emits an array of reports', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal'), fx('valid-full'), '--json']);
  const reports = JSON.parse(stdout);
  assert.equal(reports.length, 2);
  assert.equal(reports[0].skillName, 'valid-minimal');
});

test('multi-skill --sarif emits one run per skill', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('valid-minimal'), fx('valid-full'), '--sarif']);
  const sarif = JSON.parse(stdout);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs.length, 2);
});

test('--baseline suppresses a documented finding', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skillport-baseline-'));
  try {
    const file = path.join(dir, 'baseline.json');
    await writeFile(file, JSON.stringify({ suppressions: [{ rule: 'ref-exists', file: 'SKILL.md', message: 'style-guide.md' }] }));
    const { stdout } = await run('node', [bin, 'check', fx('broken-reference-path'), '--baseline', file]);
    assert.match(stdout, /Result: PASS/);
    assert.match(stdout, /Baselined: 1 known issue\(s\) suppressed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a stale baseline entry warns on stderr', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skillport-baseline-'));
  try {
    const file = path.join(dir, 'baseline.json');
    await writeFile(file, JSON.stringify({ suppressions: [{ rule: 'no-such-rule' }] }));
    const { stdout, stderr } = await run('node', [bin, 'check', fx('valid-minimal'), '--baseline', file]);
    assert.match(stdout, /Result: PASS/);
    assert.match(stderr, /warning: baseline entry #1 \(no-such-rule\) matched no issue \(stale\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unreadable or malformed baseline file is a usage error', async () => {
  await assert.rejects(
    run('node', [bin, 'check', fx('valid-minimal'), '--baseline', '/no/such/file.json']),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.stderr, /cannot read baseline/);
      return true;
    },
  );
});

test('check with no directory is a usage error', async () => {
  await assert.rejects(
    run('node', [bin, 'check']),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.stderr, /needs at least one skill directory/);
      return true;
    },
  );
});
