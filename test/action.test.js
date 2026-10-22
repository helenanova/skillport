import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const action = await readFile(path.join(root, 'action.yml'), 'utf8');
const readme = await readFile(path.join(root, 'README.md'), 'utf8');

test('action.yml declares a composite action running the bundled CLI', () => {
  assert.match(action, /^name: SkillPort$/m);
  assert.match(action, /^  using: composite$/m);
  assert.ok(action.includes('bin/skillport.js'));
  assert.ok(existsSync(path.join(root, 'bin', 'skillport.js')));
});

test('action.yml inputs cover skill path, harness selection and report format', () => {
  assert.match(action, /  skill:\n    description: [^\n]+\n    required: true/);
  assert.match(action, /  harness:\n    description: [^\n]+\n    required: false/);
  assert.match(action, /  format:\n    description: [^\n]+\n    required: false/);
});

test('README documents the action pinned by commit SHA until releases exist', () => {
  assert.match(readme, /## GitHub Action/);
  assert.match(readme, /uses: helenanova\/skillport@/);
});
