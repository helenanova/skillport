import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
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
  const expected = JSON.parse(await readFile(path.join(root, 'fixtures', 'expected.json'), 'utf8'));
  assert.equal(reports.length, Object.keys(expected).length);
});

test('check without a path exits 2', async () => {
  await assert.rejects(run('node', [bin, 'check']), (err) => err.code === 2);
});
test('exact output option emits a warning and succeeds for generated output', async () => {
  const { stdout } = await run('node', [bin, 'check', fx('generated-output-path'), '--no-smoke', '--output-path', '/tmp/skillport-report.html', '--json']);
  const r = JSON.parse(stdout);
  assert.equal(r.ok, true);
  assert.ok(r.static.issues.some((i) => i.rule === 'declared-output-path'));
});
test('missing output option argument exits 2', async () => {
  await assert.rejects(run('node', [bin, 'check', fx('generated-output-path'), '--output-path']), (err) => err.code === 2);
});

for (const [format, option] of [['text', []], ['json', ['--json']], ['markdown', ['--markdown']]]) {
  test(`orphan example marker keeps CLI PASS and line warning in ${format}`, async () => {
    const { stdout } = await run('node', [bin, 'check', fx('orphan-example-marker'), '--no-smoke', ...option]);
    if (format === 'json') {
      const report = JSON.parse(stdout);
      assert.equal(report.ok, true);
      assert.deepEqual(report.summary, { errors: 0, warnings: 1 });
      const warning = report.static.issues.find((i) => i.rule === 'example-marker-unused');
      assert.equal(warning.level, 'warning');
      assert.match(warning.message, /line 7\b/);
    } else {
      assert.match(stdout, /example-marker-unused/);
      assert.match(stdout, /line 7\b/);
      assert.match(stdout, /Result: PASS/);
    }
  });

  test(`marked example does not exempt prose error in CLI ${format}`, async () => {
    await assert.rejects(
      run('node', [bin, 'check', fx('marked-example-prose-reference'), '--no-smoke', ...option]),
      (err) => {
        assert.equal(err.code, 1);
        if (format === 'json') {
          const report = JSON.parse(err.stdout);
          assert.equal(report.ok, false);
          assert.deepEqual(report.summary, { errors: 1, warnings: 1 });
          assert.ok(report.static.issues.some((i) => i.rule === 'marked-example' && i.level === 'warning'));
          assert.deepEqual(report.static.issues.filter((i) => i.level === 'error').map((i) => i.message),
            ['referenced file "references/missing.md" does not exist in the skill']);
        } else {
          assert.match(err.stdout, /marked-example/);
          assert.match(err.stdout, /references\/missing\.md/);
          assert.doesNotMatch(err.stdout, /template-only\.md/);
          assert.match(err.stdout, /Result: FAIL/);
        }
        return true;
      },
    );
  });
}
