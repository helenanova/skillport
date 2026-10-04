import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSkill } from '../src/index.js';

const fixtures = path.join(fileURLToPath(new URL('..', import.meta.url)), 'fixtures');
const fx = (name) => path.join(fixtures, name);

test('valid-minimal passes on all three harnesses', async () => {
  const r = await checkSkill(fx('valid-minimal'));
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.harnesses).length, 3);
  for (const h of Object.values(r.harnesses)) assert.equal(h.ok, true);
});

test('valid-full passes and smoke-tests scripts on two harnesses', async () => {
  const r = await checkSkill(fx('valid-full'));
  assert.equal(r.ok, true);
  assert.equal(r.harnesses['claude-code'].smokeTested, true);
  assert.equal(r.harnesses['codex'].smokeTested, true);
  assert.equal(r.harnesses['cursor'].smokeTested, false);
});

test('official-example metadata mapping passes on all three checks', async () => {
  const r = await checkSkill(fx('spec-metadata'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.static.issues, []);
  for (const h of Object.values(r.harnesses)) assert.equal(h.ok, true);
});

test('ordinary prose punctuation does not break reference lookup', async () => {
  const r = await checkSkill(fx('reference-punctuation'));
  assert.equal(r.ok, true);
});

test('non-code scripts asset is not treated as an executable', async () => {
  const r = await checkSkill(fx('script-data'));
  assert.equal(r.ok, true);
  for (const h of Object.values(r.harnesses)) {
    assert.equal(h.steps.some((s) => s.name === 'script scripts/data.json'), false);
  }
});

test('escaping symlink fails before copying or syntax checking', async () => {
  const r = await checkSkill(fx('symlink-escape'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'symlink-escape'));
  assert.equal(r.harnesses['claude-code'].smokeTested, false);
});

test('out-of-spec compatibility length and empty metadata value fail', async () => {
  const compatibility = await checkSkill(fx('compatibility-oversized'));
  assert.equal(compatibility.ok, false);
  assert.ok(compatibility.static.issues.some((i) => i.rule === 'compatibility-format'));
  const metadata = await checkSkill(fx('metadata-empty-value'));
  assert.equal(metadata.ok, false);
  assert.ok(metadata.static.issues.some((i) => i.rule === 'metadata-format'));
});

test('missing SKILL.md is fatal for every harness', async () => {
  const r = await checkSkill(fx('missing-skill-md'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'skill-md-exists'));
  for (const h of Object.values(r.harnesses)) assert.equal(h.ok, false);
});

test('broken reference path is reported and fails the run', async () => {
  const r = await checkSkill(fx('broken-reference-path'));
  assert.equal(r.ok, false);
  const issue = r.static.issues.find((i) => i.rule === 'ref-exists');
  assert.ok(issue, 'ref-exists issue present');
  assert.match(issue.message, /style-guide\.md/);
});

test('missing frontmatter fails name and description rules', async () => {
  const r = await checkSkill(fx('missing-frontmatter'));
  assert.equal(r.ok, false);
  const rules = r.static.issues.map((i) => i.rule);
  assert.ok(rules.includes('frontmatter-name'));
  assert.ok(rules.includes('frontmatter-description'));
});

test('invalid name is rejected and mismatched dir warns', async () => {
  const r = await checkSkill(fx('invalid-name'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'name-format'));
});

test('absolute paths are flagged', async () => {
  const r = await checkSkill(fx('absolute-path'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'no-absolute-paths'));
});

test('script syntax error fails the smoke test, not the parse', async () => {
  const r = await checkSkill(fx('script-syntax-error'));
  assert.equal(r.ok, false);
  const cc = r.harnesses['claude-code'];
  assert.ok(cc.steps.some((s) => s.name === 'script scripts/rename.js' && s.ok === false));
});

test('oversized description fails the length rule', async () => {
  const r = await checkSkill(fx('oversized-description'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'description-length'));
});

test('declared but missing script fails ref-exists', async () => {
  const r = await checkSkill(fx('missing-script-entry'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'ref-exists'));
});

test('--no-smoke skips smoke steps', async () => {
  const r = await checkSkill(fx('valid-full'), { smoke: false });
  assert.equal(r.harnesses['claude-code'].steps.length, 0);
  assert.equal(r.harnesses['claude-code'].smokeTested, false);
});

test('harness subset selection works', async () => {
  const r = await checkSkill(fx('valid-minimal'), { harnesses: ['cursor'] });
  assert.deepEqual(Object.keys(r.harnesses), ['cursor']);
});

test('unknown harness throws a useful error', async () => {
  await assert.rejects(() => checkSkill(fx('valid-minimal'), { harnesses: ['nope'] }), /unknown harness/);
});

test('non-directory path returns a fatal result', async () => {
  const r = await checkSkill(fx('does-not-exist'));
  assert.equal(r.ok, false);
  assert.match(r.fatal, /not a directory/);
});

// Characterize current behavior without silently weakening input-path checks.
for (const name of ['generated-output-path', 'absolute-input-path', 'mixed-input-output-path']) {
  test(`current absolute-path detector rejects ${name}`, async () => {
    const r = await checkSkill(fx(name));
    assert.equal(r.ok, false);
    assert.ok(r.static.issues.some((i) => i.rule === 'no-absolute-paths'));
  });
}
test('current reference detector flags a fenced template link', async () => {
  const r = await checkSkill(fx('example-template-link'));
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'ref-exists'));
});
test('explicit generated output exemption warns and leaves strict default unchanged', async () => {
  const r = await checkSkill(fx('generated-output-path'), { outputPaths: ['/tmp/skillport-report.html'] });
  assert.equal(r.ok, true);
  assert.ok(r.static.issues.some((i) => i.rule === 'declared-output-path'));
});
test('output exemption does not hide mixed input dependency', async () => {
  const r = await checkSkill(fx('mixed-input-output-path'), { outputPaths: ['/tmp/skillport-report.html'] });
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'no-absolute-paths' && i.message.includes('/home/alex/private.csv')));
});
for (const output of ['/tmp/', '/tmp/*', '/tmp/../home/private.csv', '/tmp/not-used.json', '/home/alex/private.csv']) {
  test(`unsafe or unused output declaration rejected: ${output}`, async () => {
    const r = await checkSkill(fx('generated-output-path'), { outputPaths: [output] });
    assert.equal(r.ok, false);
    assert.ok(r.static.issues.some((i) => i.rule === 'output-path-config'));
  });
}
test('explicitly marked Markdown template passes with a warning', async () => {
  const r = await checkSkill(fx('marked-template-link'));
  assert.equal(r.ok, true);
  assert.ok(r.static.issues.some((i) => i.rule === 'marked-example'));
});
test('declared output never exempts a Markdown-linked absolute dependency', async () => {
  const { runStaticChecks } = await import('../src/checks/static.js');
  const issues = runStaticChecks({ hasSkillMd: true, frontmatterErrors: [],
    frontmatter: { name: 'linked-output', description: 'Check linked absolute dependencies safely.' },
    dirName: 'linked-output', body: '[Input](/tmp/data.json)',
    raw: '[Input](/tmp/data.json)', files: [], escapingSymlinks: [] },
  { outputPaths: ['/tmp/data.json'] });
  assert.ok(issues.some((i) => i.rule === 'no-absolute-paths'));
});
test('output config cannot hide a parent escape or escaping symlink', async () => {
  const r = await checkSkill(fx('symlink-escape'), { outputPaths: ['/tmp/unused.html'] });
  assert.equal(r.ok, false);
  assert.ok(r.static.issues.some((i) => i.rule === 'symlink-escape'));
});
