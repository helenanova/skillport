import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReferences } from '../src/skill.js';
import { runStaticChecks } from '../src/checks/static.js';

const refs = (raw) => extractReferences({ raw });

test('Markdown destinations preserve escaped and angle-bracket spaces', () => {
  assert.deepEqual(refs([
    String.raw`[escaped](references/a\ file.md)`,
    '[angle](<references/other file.md>)',
    '[angle-title](<references/third file.md> "Third file")',
  ].join('\n')), [
    'references/a file.md',
    'references/other file.md',
    'references/third file.md',
  ]);
});

test('Markdown destinations keep existing exclusions, fragments and titles', () => {
  assert.deepEqual(refs([
    '[fragment](references/guide.md#usage)',
    '[angle-fragment](<references/section file.md#intro>)',
    '[title](references/titled.md "Guide title")',
    '[web](https://example.com/references/not-local.md)',
    '[mail](mailto:test@example.com)',
    '[anchor](#local)',
  ].join('\n')), [
    'references/guide.md',
    'references/section file.md',
    'references/titled.md',
  ]);
});


test('Markdown destinations skip non-file URI schemes but keep Windows paths', () => {
  const raw = [
    '[phone](tel:+15551234567)',
    '[data](data:text/plain,hello)',
    '[urn](urn:isbn:9780132350884)',
    '[windows](C:\\input.csv)',
  ].join('\n');
  assert.deepEqual(refs(raw), ['C:\\input.csv']);

  const issues = runStaticChecks({
    hasSkillMd: true,
    frontmatterErrors: [],
    frontmatter: { name: 'markdown-destinations', description: 'Check Markdown URI destinations.' },
    dirName: 'markdown-destinations',
    raw,
    body: raw,
    files: [],
    escapingSymlinks: [],
  });
  const absolute = issues.find((i) => i.rule === 'no-absolute-paths');
  assert.ok(absolute, 'Windows absolute path is still reported');
  assert.ok(absolute.message.includes('C:\\input.csv'));
  assert.equal(issues.some((i) => i.message.includes('tel:') || i.message.includes('data:') || i.message.includes('urn:')), false);
});

test('Markdown destinations normalize dot segments and percent encoding', () => {
  const raw = [
    '[dot](./references/guide.md)',
    '[fold](references/nested/../guide.md)',
    '[space](references/space%20guide.md)',
    '[escape](./../outside.md)',
  ].join('\n');
  assert.deepEqual(refs(raw), [
    'references/guide.md',
    'references/space guide.md',
    '../outside.md',
  ]);

  const issues = runStaticChecks({
    hasSkillMd: true,
    frontmatterErrors: [],
    frontmatter: { name: 'markdown-destinations', description: 'Check normalized Markdown destinations.' },
    dirName: 'markdown-destinations',
    raw: '[dot](./references/guide.md)\n[space](references/space%20guide.md)',
    body: '[dot](./references/guide.md)\n[space](references/space%20guide.md)',
    files: ['references/guide.md', 'references/space guide.md'],
    escapingSymlinks: [],
  });
  assert.equal(issues.some((i) => i.rule === 'ref-exists'), false);
});

test('full Markdown destination filenames are checked as bundled files', () => {
  const raw = '[Guide](<references/missing guide.md>)';
  const issues = runStaticChecks({
    hasSkillMd: true,
    frontmatterErrors: [],
    frontmatter: { name: 'markdown-destinations', description: 'Check Markdown destinations with spaces.' },
    dirName: 'markdown-destinations',
    raw,
    body: raw,
    files: [],
    escapingSymlinks: [],
  });
  const missing = issues.find((i) => i.rule === 'ref-exists');
  assert.ok(missing, 'missing linked file is reported');
  assert.ok(missing.message.includes('references/missing guide.md'));

  const existing = runStaticChecks({
    hasSkillMd: true,
    frontmatterErrors: [],
    frontmatter: { name: 'markdown-destinations', description: 'Check Markdown destinations with spaces.' },
    dirName: 'markdown-destinations',
    raw: '[Guide](<references/existing guide.md>)',
    body: '[Guide](<references/existing guide.md>)',
    files: ['references/existing guide.md'],
    escapingSymlinks: [],
  });
  assert.equal(existing.some((i) => i.rule === 'ref-exists'), false);
});

test('absolute and parent Markdown destinations survive space handling', () => {
  assert.deepEqual(refs([
    '[abs](</tmp/input file.csv>)',
    '[parent](<../shared file.md>)',
  ].join('\n')), ['/tmp/input file.csv', '../shared file.md']);
});
