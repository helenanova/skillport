import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkill } from '../src/skill.js';
import { smokeTest } from '../src/checks/smoke.js';
import { HARNESSES } from '../src/harnesses/index.js';

async function snapshot(root) {
  const skill = await loadSkill(root);
  return Promise.all(skill.files.map(async (file) => [file, await fs.readFile(path.join(root, file), 'utf8')]));
}

for (const id of ['claude-code', 'codex']) {
  test(`${id} syntax checks do not execute scripts or alter source, and remove staging`, async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-boundary-'));
    const root = path.join(temp, 'syntax-only');
    const sentinel = path.join(temp, 'must-not-exist.txt');
    let sandbox;
    const harness = { ...HARNESSES[id], layout(base, name) {
      if (base !== '~') sandbox = base;
      return HARNESSES[id].layout(base, name);
    } };
    try {
      await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
      await fs.writeFile(path.join(root, 'SKILL.md'), '---\nname: syntax-only\ndescription: Verify syntax checks without executing scripts.\n---\nCheck scripts/probe.js, scripts/probe.py and scripts/probe.sh.\n');
      await fs.writeFile(path.join(root, 'scripts/probe.js'), `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`);
      await fs.writeFile(path.join(root, 'scripts/probe.py'), `from pathlib import Path\nPath(${JSON.stringify(sentinel)}).write_text('executed')\n`);
      await fs.writeFile(path.join(root, 'scripts/probe.sh'), `printf executed > '${sentinel}'\n`);
      const before = await snapshot(root);
      const steps = await smokeTest(await loadSkill(root), harness);
      for (const file of ['probe.js', 'probe.py', 'probe.sh']) {
        const step = steps.find((s) => s.name === `script scripts/${file}`);
        assert.ok(step, `${file} has a syntax-check step`);
        assert.equal(step.ok, true, step.detail);
      }
      assert.equal(steps.find((s) => s.name === 'discovery').ok, true);
      await assert.rejects(fs.stat(sentinel), { code: 'ENOENT' });
      assert.deepEqual(await snapshot(root), before);
      await assert.rejects(fs.stat(path.join(root, 'scripts/__pycache__')), { code: 'ENOENT' });
      assert.ok(sandbox, 'layout captured the actual staging directory');
      await assert.rejects(fs.stat(sandbox), { code: 'ENOENT' });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
      if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
    }
  });
}

test('syntax failure still removes the staging directory and leaves source unchanged', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-boundary-'));
  const root = path.join(temp, 'broken-syntax');
  let sandbox;
  const harness = { ...HARNESSES.codex, layout(base, name) {
    if (base !== '~') sandbox = base;
    return HARNESSES.codex.layout(base, name);
  } };
  try {
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(root, 'SKILL.md'), '---\nname: broken-syntax\ndescription: Verify staging cleanup after a syntax failure.\n---\nCheck scripts/broken.js.\n');
    await fs.writeFile(path.join(root, 'scripts/broken.js'), 'const broken = ;\n');
    const before = await snapshot(root);
    const steps = await smokeTest(await loadSkill(root), harness);
    assert.equal(steps.find((s) => s.name === 'script scripts/broken.js').ok, false);
    assert.deepEqual(await snapshot(root), before);
    assert.ok(sandbox);
    await assert.rejects(fs.stat(sandbox), { code: 'ENOENT' });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
  }
});
