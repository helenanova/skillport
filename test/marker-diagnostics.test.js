import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markedMarkdownExamples, extractReferences } from '../src/skill.js';
import { runStaticChecks } from '../src/checks/static.js';
const marker = '<!-- skillport:example -->';
const check = (raw) => runStaticChecks({hasSkillMd:true,frontmatterErrors:[],
  frontmatter:{name:'marker-diagnostics',description:'Check unused marker diagnostics without changing reference checks.'},
  dirName:'marker-diagnostics',raw,body:raw,files:[],escapingSymlinks:[]});
for (const [name, tail] of [
  ['blank line', '\n```md\n[X](missing.md)\n```'],
  ['shell', '```bash\npython scripts/missing.py\n```'],
  ['unclosed', '```md\n[X](missing.md)'],
  ['mismatched', '```md\n[X](missing.md)\n~~~'],
  ['short close', '````md\n[X](missing.md)\n```'],
]) {
  test(`unused marker warns and retains errors: ${name}`, () => {
    const issues=check(marker+'\n'+tail);
    assert.ok(issues.some(i=>i.rule==='example-marker-unused' && i.message.includes('line 1')));
    assert.ok(issues.some(i=>i.rule==='ref-exists'));
  });
}
for (const indent of ['', ' ', '   ']) {
  test(`CRLF and supported indentation still apply: ${indent.length}`, () => {
    const raw=marker+'\r\n'+indent+'~~~~markdown\r\n[X](missing.md)\r\n'+indent+'~~~~~\r\n';
    const result=markedMarkdownExamples(raw);
    assert.equal(result.count,1);
    assert.deepEqual(result.ignoredMarkerLines,[]);
    assert.deepEqual(extractReferences({raw}),[]);
  });
}
test('marker inside code example is data, not an unused directive', () => {
  const raw='````markdown\n'+marker+'\n```md\n[X](missing.md)\n```\n````';
  assert.deepEqual(markedMarkdownExamples(raw).ignoredMarkerLines,[]);
  assert.equal(markedMarkdownExamples(raw).count,0);
});
test('multiple markers apply independently and unused line is accurate', () => {
  const raw=marker+'\n```md\n[X](example.md)\n```\n'+marker+'\n\n[X](missing.md)';
  assert.equal(markedMarkdownExamples(raw).count,1);
  assert.deepEqual(markedMarkdownExamples(raw).ignoredMarkerLines,[5]);
  assert.deepEqual(extractReferences({raw}),['missing.md']);
});
test('orphan marker warns but does not create an error alone', () => {
  const issues=check(marker);
  assert.ok(issues.some(i=>i.rule==='example-marker-unused'));
  assert.equal(issues.some(i=>i.level==='error'),false);
});
