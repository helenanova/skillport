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


test('parses CRLF, comments, blank lines and quoted values with exact body', () => {
  const input = '---\r\nname: "quoted-demo"\r\n\r\n# comment\r\nallowed-tools:\r\n  - "Read"\r\nmetadata:\r\n  source: \'fixture\'\r\n---\r\nBody first\r\n\r\nBody last\r\n';
  const { data, body, errors } = parseFrontmatter(input);
  assert.deepEqual(errors, []);
  assert.equal(data.name, 'quoted-demo');
  assert.deepEqual(data['allowed-tools'], ['Read']);
  assert.deepEqual(data.metadata, { source: 'fixture' });
  assert.equal(body, 'Body first\r\n\r\nBody last\r\n');
});


for (const malformed of ['---junk', '----', '--- ']) {
  test(`rejects malformed opening delimiter: ${JSON.stringify(malformed)}`, () => {
    const input = `${malformed}\nname: demo\n---\nBody\n`;
    const { data, body, errors } = parseFrontmatter(input);
    assert.deepEqual(data, {});
    assert.equal(body, input);
    assert.deepEqual(errors, [{ message: 'no frontmatter block at the top of the file', line: 1 }]);
  });
}

for (const malformed of ['----', '--- ']) {
  test(`rejects malformed closing delimiter: ${JSON.stringify(malformed)}`, () => {
    const input = `---\nname: demo\n${malformed}\nBody\n`;
    const { data, body, errors } = parseFrontmatter(input);
    assert.deepEqual(data, {});
    assert.equal(body, input);
    assert.deepEqual(errors, [{ message: 'frontmatter block is not closed with a --- line', line: 1 }]);
  });
}

test('accepts a closing delimiter at end of file with an empty body', () => {
  const { data, body, errors } = parseFrontmatter('---\nname: demo\n---');
  assert.deepEqual(errors, []);
  assert.deepEqual(data, { name: 'demo' });
  assert.equal(body, '');
});

test('reports missing frontmatter', () => {
  const { errors } = parseFrontmatter('# nope\n');
  assert.equal(errors.length, 1);
});

test('reports unclosed frontmatter', () => {
  const { errors } = parseFrontmatter('---\nname: foo\n# never closed\n');
  assert.equal(errors.length, 1);
});

test('unparseable lines report their 1-based position in SKILL.md', () => {
  const { errors } = parseFrontmatter('---\nname: demo\noops\n---\nBody\n');
  assert.deepEqual(errors, [{ message: 'unparseable frontmatter line: oops', line: 3 }]);
});

test('a later unparseable line keeps its exact position', () => {
  const { errors } = parseFrontmatter('---\nname: demo\ndescription: ok\n\n# note\n  broken  indent\n---\nBody\n');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 6);
});
