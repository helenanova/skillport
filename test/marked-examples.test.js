import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReferences, markedMarkdownExamples } from '../src/skill.js';
const marker = '<!-- skillport:example -->';
const refs = (raw) => extractReferences({ raw });
for (const open of ['```md', '~~~markdown', '````md']) {
  test(`marked balanced fence excludes only relative examples: ${open}`, () => {
    const close = open.match(/^[`~]+/)[0];
    const raw = `${marker}\n${open}\n[Example](REFERENCE.md)\nreferences/sample.md\n${close}`;
    assert.deepEqual(refs(raw), []);
    assert.equal(markedMarkdownExamples(raw).count, 1);
  });
}
test('unmarked Markdown still checks', () => assert.deepEqual(refs('```md\n[X](real.md)\n```'), ['real.md']));
test('marker is block-specific', () => {
  assert.deepEqual(refs(`${marker}\n` + '```md\n[X](example.md)\n```\n```md\n[X](real.md)\n```'), ['real.md']);
});
test('blank line between marker and fence does not exclude', () => assert.deepEqual(refs(`${marker}\n\n` + '```md\n[X](real.md)\n```'), ['real.md']));
test('shell dependencies remain even with marker', () => assert.deepEqual(refs(`${marker}\n` + '```bash\npython scripts/real.py\n```'), ['scripts/real.py']));
test('unclosed fence remains checked', () => assert.deepEqual(refs(`${marker}\n` + '```md\n[X](real.md)'), ['real.md']));
test('nested marker in shell cannot suppress', () => assert.deepEqual(refs('````bash\n'+marker+'\n```md\n[X](real.md)\n```\n````'), ['real.md']));
test('absolute and parent links remain checked in marked examples', () => {
  assert.deepEqual(refs(marker+'\n```md\n[X](/tmp/in.csv)\n[Y](../private.csv)\n```'), ['/tmp/in.csv','../private.csv']);
});
test('outside real link survives', () => assert.deepEqual(refs(marker+'\n```md\n[X](example.md)\n```\n[X](real.md)'), ['real.md']));
test('marked example preserves raw absolute-path errors', async () => {
  const { runStaticChecks } = await import('../src/checks/static.js');
  const raw = marker+'\n```md\nRead /home/alex/private.csv\n```';
  const issues = runStaticChecks({ hasSkillMd:true, frontmatterErrors:[],
    frontmatter:{name:'marked-test',description:'Test raw absolute path checks in marked examples.'},
    dirName:'marked-test',raw,body:raw,files:[],escapingSymlinks:[] });
  assert.ok(issues.some((i)=>i.rule==='no-absolute-paths'));
  assert.ok(issues.some((i)=>i.rule==='marked-example'));
});
test('short closing fence cannot exclude references', () => {
  assert.deepEqual(refs(marker+'\n````md\n[X](real.md)\n```'), ['real.md']);
});
