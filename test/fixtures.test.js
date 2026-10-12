import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { withFixture } from '../src/fixtures.js';
import { checkSkill } from '../src/index.js';

for (const throws of [false, true]) {
  test(`packaged symlink fixture is negative, read-only and cleaned${throws ? ' on rejection' : ''}`, async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-package-test-'));
    const fixture = path.join(temp, 'symlink-escape');
    let staged;
    try {
      await fs.mkdir(fixture);
      await fs.writeFile(path.join(fixture, 'SKILL.md'), '---\nname: symlink-escape\ndescription: Detect escaping symlinks in a generated fixture.\n---\nDo not read the symlink.\n');
      const inspect = async (dir) => {
        staged = dir;
        const report = await checkSkill(dir);
        assert.equal(report.ok, false);
        assert.ok(report.static.issues.some((i) => i.rule === 'symlink-escape'));
        assert.equal(report.harnesses.codex.smokeTested, false);
        if (throws) throw new Error('inspection rejected');
        return report;
      };
      if (throws) await assert.rejects(withFixture(temp, 'symlink-escape', inspect), /inspection rejected/);
      else await withFixture(temp, 'symlink-escape', inspect);
      assert.deepEqual(await fs.readdir(fixture), ['SKILL.md']);
      assert.ok(staged);
      await assert.rejects(fs.stat(path.dirname(staged)), { code: 'ENOENT' });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
}

test('ordinary fixture uses its original directory without reconstruction', async () => {
  const result = await withFixture('/unused-fixtures', 'valid-minimal', async (dir) => dir);
  assert.equal(result, path.join('/unused-fixtures', 'valid-minimal'));
});
