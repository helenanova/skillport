import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadSkill } from '../skill.js';

const run = promisify(execFile);
const EXEC_OPTS = { timeout: 10000, maxBuffer: 1024 * 1024 };

const SCRIPT_RE = /(?:^|\/)(scripts\/.+|[^/]+\.(?:sh|py|m?js))$/;
const INTERPRETERS = [
  { test: (f) => f.endsWith('.js') || f.endsWith('.mjs'), bin: 'node', args: (f) => ['--check', f] },
  { test: (f) => f.endsWith('.py'), bin: 'python3', args: (f) => ['-m', 'py_compile', f] },
  { test: (f) => f.endsWith('.sh'), bin: 'bash', args: (f) => ['-n', f] },
];

async function which(bin) {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [bin], EXEC_OPTS);
    return true;
  } catch {
    return false;
  }
}

// Smoke test, MVP definition (documented in README):
//  1. stage the skill into a throwaway sandbox at the harness's expected path
//  2. discovery: re-load the staged copy the way the harness loader would
//  3. scripts: interpreter present + syntax check for every declared script
// If the harness CLI is installed locally we note it, but staging is always
// emulated so CI needs no vendor logins.
export async function smokeTest(skill, harness) {
  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok, detail });

  const name = skill.frontmatter.name || skill.dirName;
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), `skillport-${harness.id}-`));
  try {
    const target = harness.layout(sandbox, name);
    if (harness.id === 'cursor') {
      step('stage', false, 'cursor staging not implemented');
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(skill.root, target, { recursive: true });
      step('stage', true, `staged at ${harness.layout('~', name)}`);
    }

    let staged;
    try {
      staged = await loadSkill(target);
      if (!staged.hasSkillMd) {
        step('discovery', false, 'loader cannot find SKILL.md at the expected path');
      } else if (staged.frontmatterErrors.length > 0) {
        step('discovery', false, `manifest parse errors: ${staged.frontmatterErrors.join('; ')}`);
      } else if (!staged.frontmatter.name || !staged.frontmatter.description) {
        step('discovery', false, 'manifest is missing name or description after staging');
      } else {
        step('discovery', true, `loaded "${staged.frontmatter.name}" (${staged.files.length} files)`);
      }
    } catch (err) {
      step('discovery', false, `loader threw: ${err.message}`);
    }

    const scripts = (staged ? staged.files : skill.files).filter((f) => SCRIPT_RE.test(f));
    if (scripts.length === 0) {
      step('scripts', true, 'no scripts declared');
    } else {
      for (const rel of scripts) {
        const full = path.join(target, rel);
        const interp = INTERPRETERS.find((i) => i.test(rel));
        if (!interp) {
          step(`script ${rel}`, false, 'no known interpreter for this extension');
          continue;
        }
        if (!(await which(interp.bin))) {
          step(`script ${rel}`, false, `interpreter "${interp.bin}" not found on PATH`);
          continue;
        }
        try {
          await run(interp.bin, interp.args(full), EXEC_OPTS);
          step(`script ${rel}`, true, `${interp.bin} syntax check passed`);
        } catch (err) {
          const detail = (err.stderr || err.message || '').trim().split('\n').slice(0, 3).join(' | ');
          step(`script ${rel}`, false, detail || 'syntax check failed');
        }
      }
    }

    const native = await which(harness.cli);
    step('harness-cli', true, native
      ? `"${harness.cli}" found on PATH (staging still emulated in MVP)`
      : `"${harness.cli}" not installed; emulated loader used`);
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }

  return steps;
}
