import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText, formatMarkdown } from '../src/report.js';

function result(overrides = {}) {
  return {
    skillName: 'report-probe', skillDir: '/tmp/report-probe', ok: true,
    static: { issues: [] },
    harnesses: { cursor: { label: 'Cursor', ok: true, smokeTested: false, issues: [], steps: [] } },
    summary: { errors: 0, warnings: 0 }, ...overrides,
  };
}

for (const [name, format] of [['text', formatText], ['markdown', formatMarkdown]]) {
  test(`${name} fatal report needs no static or harness data`, () => {
    const output = format({ skillDir: '/missing/skill', fatal: 'SKILL.md is missing' });
    assert.ok(output.includes('/missing/skill'));
    assert.ok(output.includes('SKILL.md is missing'));
    assert.doesNotMatch(output, /Result: PASS|Harness compatibility|\| Harness \|/);
  });
}

test('warning-only reports preserve PASS and show warning details', () => {
  const report = result({ static: { issues: [{ level: 'warning', rule: 'marked-example', message: 'Example references skipped' }] }, summary: { errors: 0, warnings: 1 } });
  assert.match(formatText(report), /Format checks:  ✓ clean, 1 warning\(s\)/);
  assert.match(formatText(report), /Result: PASS.*1 warning\(s\)/);
  assert.ok(formatMarkdown(report).includes('| warning | format | `marked-example` | Example references skipped |'));
  assert.match(formatMarkdown(report), /\*\*Result: PASS\*\*/);
});

test('Cursor-only reports use static-only labels without inventing smoke execution', () => {
  assert.match(formatText(result()), /Cursor\s+\(static only\)/);
  assert.ok(formatMarkdown(result()).includes('| Cursor | static only | ✅ pass |'));
  assert.doesNotMatch(formatMarkdown(result()), /static \+ smoke|\| Problem \|/);
});

test('static, harness and failed smoke diagnostics appear in both report formats', () => {
  const report = result({ ok: false, static: { issues: [{ level: 'error', rule: 'missing-ref', message: 'Missing references/input.md' }] }, harnesses: { codex: { label: 'Codex', ok: false, smokeTested: true, issues: [{ level: 'error', rule: 'manifest', message: 'Invalid manifest' }], steps: [{ name: 'script probe.js', ok: false, detail: 'syntax failed' }] } }, summary: { errors: 3, warnings: 0 } });
  const text = formatText(report), markdown = formatMarkdown(report);
  for (const output of [text, markdown]) {
    assert.ok(output.includes('Missing references/input.md'));
    assert.ok(output.includes('Invalid manifest'));
    assert.ok(output.includes('script probe.js: syntax failed'));
    assert.match(output, /Result: FAIL/);
  }
  assert.ok(markdown.includes('| error | Codex | `smoke` | script probe.js: syntax failed |'));
  assert.ok(markdown.includes('| Codex | static + smoke | ❌ fail |'));
});

test('Markdown diagnostic pipes are escaped without changing text reports', () => {
  const report = result({ ok: false, static: { issues: [{ level: 'error', rule: 'missing-ref', message: 'Missing a|b|c.md' }] }, summary: { errors: 1, warnings: 0 } });
  assert.ok(formatMarkdown(report).includes('Missing a\\|b\\|c.md'));
  assert.ok(formatText(report).includes('Missing a|b|c.md'));
});

test('text hides successful staging and CLI hints but retains discovery details', () => {
  const report = result({ harnesses: { codex: { label: 'Codex', ok: true, smokeTested: true, issues: [], steps: [{ name: 'stage', ok: true, detail: 'copied to temporary directory' }, { name: 'harness-cli', ok: true, detail: 'not installed' }, { name: 'discovery', ok: true, detail: 'skill discovered' }] } } });
  const output = formatText(report);
  assert.doesNotMatch(output, /copied to temporary directory|not installed/);
  assert.ok(output.includes('discovery: skill discovered'));
});
