import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { formatSarif } from '../src/sarif.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const bin = path.join(root, 'bin', 'skillport.js');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const probe = {
  skillName: 'sarif-probe', skillDir: '/tmp/sarif-probe', ok: false,
  static: {
    issues: [
      { level: 'error', rule: 'ref-exists', message: 'referenced file "references/missing.md" does not exist in the skill', file: 'SKILL.md', line: 4, column: 9 },
      { level: 'warning', rule: 'description-thin', message: 'description is very short', file: 'SKILL.md' },
    ],
  },
  harnesses: {
    codex: {
      label: 'Codex', ok: false, smokeTested: true,
      issues: [{ level: 'error', rule: 'cx-name-format', message: 'bad name' }],
      steps: [{ name: 'script scripts/rename.js', ok: false, detail: 'syntax check failed' }],
    },
  },
  summary: { errors: 3, warnings: 1 },
};

test('SARIF report is 2.1.0 with one rule per id and structured regions', () => {
  const sarif = JSON.parse(formatSarif(probe, { version: '0.0.0-test' }));
  assert.equal(sarif.version, '2.1.0');
  assert.ok(sarif.$schema.includes('sarif-2.1.0'));
  const driver = sarif.runs[0].tool.driver;
  assert.equal(driver.name, 'SkillPort');
  assert.equal(driver.version, '0.0.0-test');
  assert.deepEqual(driver.rules.map((r) => r.id).sort(), ['cx-name-format', 'ref-exists', 'smoke', 'description-thin'].sort());
  const results = sarif.runs[0].results;
  assert.equal(results.length, 4);
  const ref = results.find((r) => r.ruleId === 'ref-exists');
  assert.equal(ref.level, 'error');
  const loc = ref.locations[0].physicalLocation;
  assert.equal(loc.artifactLocation.uri, 'SKILL.md');
  assert.equal(loc.region.startLine, 4);
  assert.equal(loc.region.startColumn, 9);
  const warning = results.find((r) => r.ruleId === 'description-thin');
  assert.equal(warning.level, 'warning');
  assert.equal(warning.locations[0].physicalLocation.region, undefined);
  const smoke = results.find((r) => r.ruleId === 'smoke');
  assert.match(smoke.message.text, /Codex: script scripts\/rename\.js: syntax check failed/);
});

test('SARIF fatal reports need no static or harness data', () => {
  const sarif = JSON.parse(formatSarif({ skillDir: '/missing/skill', fatal: 'SKILL.md is missing', ok: false }));
  assert.equal(sarif.runs[0].results.length, 1);
  assert.equal(sarif.runs[0].results[0].ruleId, 'load');
  assert.equal(sarif.runs[0].results[0].level, 'error');
});

test('CLI --sarif emits a parseable SARIF report with positions and exit 1 on errors', async () => {
  await assert.rejects(
    run('node', [bin, 'check', path.join(root, 'fixtures', 'broken-reference-path'), '--sarif']),
    (err) => {
      assert.equal(err.code, 1);
      const sarif = JSON.parse(err.stdout);
      assert.equal(sarif.version, '2.1.0');
      assert.equal(sarif.runs[0].tool.driver.version, pkg.version);
      const ref = sarif.runs[0].results.find((r) => r.ruleId === 'ref-exists');
      assert.ok(ref, 'ref-exists result present');
      assert.equal(typeof ref.locations[0].physicalLocation.region.startLine, 'number');
      return true;
    },
  );
});

test('CLI --sarif on a passing skill exits 0 with an empty result set', async () => {
  const { stdout } = await run('node', [bin, 'check', path.join(root, 'fixtures', 'valid-minimal'), '--sarif']);
  const sarif = JSON.parse(stdout);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results.length, 0);
  assert.equal(sarif.runs[0].properties.ok, true);
});
