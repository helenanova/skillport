import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/frontmatter.js';

test('parses scalar keys', () => {
  const { data, body, errors } = parseFrontmatter('---\nname: foo\ndescription: a b c\n---\n# Hi\n');
  assert.deepEqual(errors, []);
  assert.equal(data.name, 'foo');
  assert.equal(data.description, 'a b c');
  assert.equal(body, '# Hi\n');
});

test('parses block lists', () => {
  const { data, errors } = parseFrontmatter('---\nname: foo\nallowed-tools:\n  - Bash\n  - Read\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(data['allowed-tools'], ['Bash', 'Read']);
});

test('parses spec-valid metadata mapping', () => {
  const { data, errors } = parseFrontmatter('---\nname: pdf-processing\ndescription: Extract PDF text.\nmetadata:\n  author: example-org\n  version: "1.0"\n---\n# PDF Processing\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(data.metadata, { author: 'example-org', version: '1.0' });
});

test('reports missing frontmatter', () => {
  const { errors } = parseFrontmatter('# nope\n');
  assert.equal(errors.length, 1);
});

test('reports unclosed frontmatter', () => {
  const { errors } = parseFrontmatter('---\nname: foo\n# never closed\n');
  assert.equal(errors.length, 1);
});
