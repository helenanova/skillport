import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReferenceDetails, extractReferences, positionAt } from '../src/skill.js';
import { runStaticChecks } from '../src/checks/static.js';
import { formatText, formatMarkdown } from '../src/report.js';

const skill = (raw) => ({
  hasSkillMd: true, frontmatterErrors: [],
  frontmatter: { name: 'line-probe', description: 'Check that diagnostics carry exact positions.' },
  dirName: 'line-probe', raw, body: raw, files: [], escapingSymlinks: [],
});

test('markdown link and prose reference diagnostics carry line and column', () => {
  const raw = '# Title\n\nSee [guide](references/missing.md) and scripts/missing.sh here.\n';
  const issues = runStaticChecks(skill(raw)).filter((i) => i.rule === 'ref-exists');
  assert.equal(issues.length, 2);
  const link = issues.find((i) => i.message.includes('references/missing.md'));
  const prose = issues.find((i) => i.message.includes('scripts/missing.sh'));
  assert.deepEqual({ line: link.line, column: link.column }, positionAt(raw, raw.indexOf('[guide]')));
  assert.deepEqual({ line: prose.line, column: prose.column }, positionAt(raw, raw.indexOf('scripts/missing.sh')));
  assert.equal(link.line, 3);
});

test('absolute path diagnostics carry the position of the path in the body', () => {
  const raw = 'Intro\n\nWrite /tmp/output.html here.\n';
  const issue = runStaticChecks(skill(raw)).find((i) => i.rule === 'no-absolute-paths');
  assert.deepEqual({ line: issue.line, column: issue.column }, positionAt(raw, raw.indexOf('/tmp/output.html')));
});

test('detailed extraction keeps extractReferences order and values identical', () => {
  const raw = '[a](references/a.md)\n\nprose scripts/b.sh\n[a again](references/a.md)\n';
  assert.deepEqual(extractReferences({ raw }), ['references/a.md', 'scripts/b.sh']);
  assert.deepEqual(extractReferenceDetails({ raw }).map((d) => d.ref), ['references/a.md', 'scripts/b.sh']);
});

test('text and markdown reports render file:line:column without changing the message', () => {
  const raw = '# Title\n\nSee [guide](references/missing.md).\n';
  const issues = runStaticChecks(skill(raw));
  const issue = issues.find((i) => i.rule === 'ref-exists');
  assert.equal(issue.message, 'referenced file "references/missing.md" does not exist in the skill');
  const result = {
    skillName: 'line-probe', skillDir: '/tmp/line-probe', ok: false,
    static: { issues }, harnesses: {}, summary: { errors: 1, warnings: 0 },
  };
  const expected = `(SKILL.md:${issue.line}:${issue.column})`;
  assert.ok(formatText(result).includes(`does not exist in the skill ${expected}`));
  assert.ok(formatMarkdown(result).includes(`does not exist in the skill ${expected} |`));
});

test('metadata diagnostics carry the line of their frontmatter key', () => {
  const raw = '---\nname: Bad_Name\ndescription: Checks key positions for metadata diagnostics.\ncompatibility: ' + 'x'.repeat(501) + '\n---\nBody text.\n';
  const issues = runStaticChecks({
    hasSkillMd: true, frontmatterErrors: [],
    frontmatter: { name: 'Bad_Name', description: 'Checks key positions for metadata diagnostics.', compatibility: 'x'.repeat(501) },
    frontmatterKeyLines: { name: 2, description: 3, compatibility: 4 },
    dirName: 'key-probe', raw, body: 'Body text.\n', files: [], escapingSymlinks: [],
  });
  assert.equal(issues.find((i) => i.rule === 'name-format').line, 2);
  assert.equal(issues.find((i) => i.rule === 'name-dir-mismatch').line, 2);
  assert.equal(issues.find((i) => i.rule === 'compatibility-format').line, 4);
});

test('a loaded skill exposes frontmatter key lines for diagnostics', async () => {
  const { promises: fs } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { loadSkill } = await import('../src/skill.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-keylines-'));
  try {
    await fs.writeFile(path.join(root, 'SKILL.md'), '---\nname: key-probe\ndescription: Loaded skills carry manifest key lines.\n---\nBody\n');
    const skill = await loadSkill(root);
    assert.deepEqual(skill.frontmatterKeyLines, { name: 2, description: 3 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
