import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkill } from '../src/skill.js';

async function temporary(inspect) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-loader-'));
  try { await inspect(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('loader rejects a missing path and an ordinary file as skill roots', async () => {
  await temporary(async (root) => {
    const file = path.join(root, 'not-a-directory');
    await fs.writeFile(file, 'plain file');
    for (const target of [file, path.join(root, 'missing')]) {
      await assert.rejects(loadSkill(target), (err) => {
        assert.equal(err.message, `skill path is not a directory: ${target}`);
        return true;
      });
    }
  });
});

test('loader keeps missing manifest state explicit while listing other files', async () => {
  await temporary(async (root) => {
    await fs.writeFile(path.join(root, 'notes.txt'), 'no manifest');
    const skill = await loadSkill(root);
    assert.equal(skill.root, path.resolve(root));
    assert.equal(skill.hasSkillMd, false);
    assert.equal(skill.raw, null);
    assert.equal(skill.body, '');
    assert.deepEqual(skill.frontmatter, {});
    assert.deepEqual(skill.frontmatterErrors, []);
    assert.deepEqual(skill.files, ['notes.txt']);
  });
});


test('loader surfaces an unreadable manifest instead of reporting it missing', async () => {
  await temporary(async (root) => {
    await fs.mkdir(path.join(root, 'SKILL.md'));
    await assert.rejects(loadSkill(root), (err) => {
      assert.match(err.message, /cannot read SKILL\.md/);
      assert.match(err.message, /EISDIR|illegal operation/i);
      return true;
    });
  });
});

test('loader sorts nested file paths and excludes git and dependency directories', async () => {
  await temporary(async (root) => {
    for (const file of ['z.txt', 'references/b.txt', 'references/a.txt', '.git/config', 'node_modules/pkg/index.js', 'references/.git/config', 'references/node_modules/pkg.js']) {
      const full = path.join(root, file);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, file);
    }
    const raw = '---\nname: loader-probe\ndescription: Test loading a manifest.\n---\nBody text.\n';
    await fs.writeFile(path.join(root, 'SKILL.md'), raw);
    const skill = await loadSkill(root);
    assert.equal(skill.hasSkillMd, true);
    assert.equal(skill.raw, raw);
    assert.equal(skill.frontmatter.name, 'loader-probe');
    assert.match(skill.body, /Body text/);
    assert.deepEqual(skill.files, ['SKILL.md', 'references/a.txt', 'references/b.txt', 'z.txt']);
  });
});

test('loader distinguishes contained, sibling-prefix and dangling symlinks without following directory links', async () => {
  await temporary(async (temp) => {
    const root = path.join(temp, 'skill');
    const sibling = path.join(temp, 'skill-other');
    await fs.mkdir(path.join(root, 'references'), { recursive: true });
    await fs.mkdir(sibling);
    await fs.writeFile(path.join(root, 'references/input.txt'), 'inside');
    await fs.writeFile(path.join(sibling, 'outside.txt'), 'outside');
    await fs.symlink('references/input.txt', path.join(root, 'inside.txt'));
    await fs.symlink(path.join(sibling, 'outside.txt'), path.join(root, 'escape.txt'));
    await fs.symlink('missing.txt', path.join(root, 'dangling.txt'));
    await fs.symlink('references', path.join(root, 'directory-link'));
    const skill = await loadSkill(root);
    assert.deepEqual(skill.files, ['dangling.txt', 'directory-link', 'escape.txt', 'inside.txt', 'references/input.txt']);
    assert.deepEqual(skill.escapingSymlinks.sort(), ['dangling.txt', 'escape.txt']);
  });
});
