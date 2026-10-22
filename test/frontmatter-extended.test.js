import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/frontmatter.js';

test('folded block scalar joins lines with spaces and clips to one newline', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\ndescription: >\n  first line\n  second line\n---\nBody\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'first line second line\n');
});

test('literal block scalar keeps line breaks and strips common indent', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nnotes: |\n    a\n      b\n    c\n---\nBody\n');
  assert.deepEqual(errors, []);
  assert.equal(data.notes, 'a\n  b\nc\n');
});

test('strip chomping removes the trailing newline', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\ndescription: |-\n  one\n  two\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'one\ntwo');
});

test('keep chomping preserves trailing blank lines', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nnotes: |+\n  one\n\n\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.equal(data.notes, 'one\n\n\n');
});

test('blank lines inside a folded scalar become paragraph breaks', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\ndescription: >\n  a b\n\n  c d\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'a b\nc d\n');
});

test('block scalar stops at the next top-level key', () => {
  const { data, errors, keyLines } = parseFrontmatter('---\ndescription: >\n  wrapped\nname: demo\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'wrapped\n');
  assert.equal(data.name, 'demo');
  assert.equal(keyLines.name, 4);
});

test('a list after a block scalar does not clobber the string', () => {
  const { data, errors } = parseFrontmatter('---\ndescription: |\n  text\n  - stray\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'text\n- stray\n');
});

test('inline lists parse like block lists, with quotes and booleans', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nallowed-tools: [Bash, "Web Search", true]\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(data['allowed-tools'], ['Bash', 'Web Search', true]);
});

test('inline maps parse one level and record the key line', () => {
  const { data, errors, keyLines } = parseFrontmatter('---\nname: demo\nmetadata: {author: example-org, version: "1.0"}\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(data.metadata, { author: 'example-org', version: '1.0' });
  assert.equal(keyLines.metadata, 3);
});

test('nested inline collections are rejected, not flattened', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nmetadata: {a: {b: c}}\n---\nx\n');
  assert.equal(data.metadata, undefined);
  assert.deepEqual(errors, [{ message: 'unsupported nested collection in frontmatter line: metadata: {a: {b: c}}', line: 3 }]);
});

test('commas inside quoted inline values do not split entries', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nallowed-tools: ["Read, Write", Bash]\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(data['allowed-tools'], ['Read, Write', 'Bash']);
});

test('booleans and null coerce, numbers and dates stay strings', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\ndisable-model-invocation: true\nuser-invocable: false\nfallback: null\nversion: 1.0\nreleased: 2026-10-23\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.strictEqual(data['disable-model-invocation'], true);
  assert.strictEqual(data['user-invocable'], false);
  assert.strictEqual(data.fallback, null);
  assert.strictEqual(data.version, '1.0');
  assert.strictEqual(data.released, '2026-10-23');
});

test('quoted scalars never coerce', () => {
  const { data, errors } = parseFrontmatter('---\nname: demo\nflag: "true"\nempty: "null"\n---\nx\n');
  assert.deepEqual(errors, []);
  assert.strictEqual(data.flag, 'true');
  assert.strictEqual(data.empty, 'null');
});

test('block scalars handle CRLF frontmatter', () => {
  const { data, errors } = parseFrontmatter('---\r\nname: demo\r\ndescription: >\r\n  a\r\n  b\r\n---\r\nx\r\n');
  assert.deepEqual(errors, []);
  assert.equal(data.description, 'a b\n');
});

test('indented plain lines after a scalar key still error', () => {
  const { errors } = parseFrontmatter('---\nname: demo\ndescription: ok\n  broken  indent\n---\nBody\n');
  assert.deepEqual(errors, [{ message: 'unparseable frontmatter line: broken  indent', line: 4 }]);
});
