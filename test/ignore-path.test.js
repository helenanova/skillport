import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ignorePathDirectives, referenceReport, extractReferences } from '../src/skill.js';
import { runStaticChecks } from '../src/checks/static.js';

const marker = '<!-- skillport:example -->';
const directive = (p) => `<!-- skillport:ignore-path ${p} -->`;
const skill = (raw) => ({
  hasSkillMd: true, frontmatterErrors: [],
  frontmatter: { name: 'ignore-probe', description: 'Check ignore-path directives without changing checks.' },
  dirName: 'ignore-probe', raw, body: raw, files: [], escapingSymlinks: [],
});

test('directive suppresses an exact prose path and reports itself used', () => {
  const raw = `Fill references/template.md first.\n\n${directive('references/template.md')}\n`;
  const report = referenceReport({ raw });
  assert.deepEqual(report.details, []);
  assert.deepEqual(report.directives.map((d) => d.used), [true]);
  assert.deepEqual(extractReferences({ raw }), []);
});

test('directive suppresses an exact markdown link target', () => {
  const raw = `[tpl](references/template.md)\n\n${directive('references/template.md')}\n`;
  assert.deepEqual(referenceReport({ raw }).details, []);
});

test('directive never suppresses absolute or escaping references', () => {
  const raw = `[x](/tmp/data.json)\n${directive('/tmp/data.json')}\n`;
  const report = referenceReport({ raw });
  assert.deepEqual(report.details.map((d) => d.ref), ['/tmp/data.json']);
  assert.deepEqual(report.directives.map((d) => d.used), [false]);
});

test('unused directive warns with its position, used one stays quiet', () => {
  const raw = `${directive('references/never.md')}\n\nBody without local files.\n`;
  const issues = runStaticChecks(skill(raw));
  const warning = issues.find((i) => i.rule === 'ignore-path-unused');
  assert.equal(warning.level, 'warning');
  assert.equal(warning.line, 1);
  assert.equal(issues.some((i) => i.level === 'error'), false);
});

test('directives parse with position and tolerate spacing', () => {
  const raw = `a\n\n  ${directive('references/x.md')}  \n`;
  const [d] = ignorePathDirectives(raw);
  assert.equal(d.path, 'references/x.md');
  assert.equal(d.line, 3);
});

test('example marker and ignore-path directive compose independently', () => {
  const raw = `${marker}\n\`\`\`md\n[x](references/in-example.md)\n\`\`\`\n\nSee references/real.md.\n\n${directive('references/real.md')}\n`;
  assert.deepEqual(extractReferences({ raw }), []);
});
