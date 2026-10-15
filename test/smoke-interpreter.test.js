import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

test('missing interpreters produce diagnostics and clean staging without changing source or executing scripts', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-interpreter-'));
  const root = path.join(temp, 'interpreter-probe');
  const sentinel = path.join(temp, 'must-not-exist');
  const emptyPath = path.join(temp, 'empty-path');
  let sandbox;
  try {
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.mkdir(emptyPath);
    await fs.writeFile(path.join(root, 'SKILL.md'), '---\nname: interpreter-probe\ndescription: Verify missing interpreter errors.\n---\nCheck scripts/probe.js.\n');
    const source = `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`;
    await fs.writeFile(path.join(root, 'scripts/probe.js'), source);
    const script = `
      import { loadSkill } from ${JSON.stringify(new URL('../src/skill.js', import.meta.url).href)};
      import { smokeTest } from ${JSON.stringify(new URL('../src/checks/smoke.js', import.meta.url).href)};
      import { HARNESSES } from ${JSON.stringify(new URL('../src/harnesses/index.js', import.meta.url).href)};
      let sandbox;
      const harness = { ...HARNESSES.codex, layout(base, name) {
        if (base !== '~') sandbox = base;
        return HARNESSES.codex.layout(base, name);
      } };
      const steps = await smokeTest(await loadSkill(${JSON.stringify(root)}), harness);
      console.log(JSON.stringify({ steps, sandbox }));
    `;
    const { stdout, stderr } = await run(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, PATH: emptyPath }, timeout: 30000,
    });
    assert.equal(stderr, '');
    const output = JSON.parse(stdout);
    sandbox = output.sandbox;
    assert.equal(output.steps.find((s) => s.name === 'discovery').ok, true);
    assert.deepEqual(output.steps.find((s) => s.name === 'script scripts/probe.js'), {
      name: 'script scripts/probe.js', ok: false, detail: 'interpreter "node" not found on PATH',
    });
    assert.ok(sandbox);
    await assert.rejects(fs.stat(sandbox), { code: 'ENOENT' });
    await assert.rejects(fs.stat(sentinel), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(root, 'scripts/probe.js'), 'utf8'), source);
    assert.deepEqual(await fs.readdir(path.join(root, 'scripts')), ['probe.js']);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
  }
});
