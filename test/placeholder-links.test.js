import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReferences } from '../src/skill.js';

const skill = (raw) => ({ raw });

test('documentation placeholder link targets are not file references', () => {
  const raw = [
    '> example: [Title](URL) — one-sentence description.',
    '[docs](url) [page](uri) [jump](link) [spot](path) [f](file) [t](title) [later](TODO) [later2](tbd)',
  ].join('\n');
  assert.deepEqual(extractReferences(skill(raw)), []);
});

test('real filenames are kept, including uppercase and extensionless ones', () => {
  const raw = '[license](LICENSE) [readme](README) [guide](references/guide.md) [tmpl](template.txt)';
  assert.deepEqual(extractReferences(skill(raw)), ['LICENSE', 'README', 'references/guide.md', 'template.txt']);
});

test('placeholder words with paths or extensions are still checked as files', () => {
  const raw = '[old](references/url.md) [cfg](configs/url.conf)';
  assert.deepEqual(extractReferences(skill(raw)), ['references/url.md', 'configs/url.conf']);
});
