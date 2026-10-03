import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStaticChecks } from '../src/checks/static.js';
const check = (raw, outputPaths = []) => runStaticChecks({
  hasSkillMd: true, frontmatterErrors: [],
  frontmatter: { name: 'path-template', description: 'Check absolute path template diagnostics without broader exemptions.' },
  dirName: 'path-template', raw, body: raw, files: [], escapingSymlinks: [],
}, { outputPaths });
const errors = (issues) => issues.filter((i) => i.level === 'error');
for (const template of ['/tmp/eval_review_<skill-name>.html', '/tmp/<name>/report.html', '/home/<user>/input.csv']) {
  test(`full template is reported: ${template}`, () => {
    const issues = check(`Write \`${template}\`.`);
    assert.ok(issues.some((i) => i.rule === 'no-absolute-paths' && i.message.includes(`"${template}"`)));
  });
}
test('a prefix declaration cannot exempt a template', () => {
  const issues = check('Write `/tmp/eval_review_<skill-name>.html`.', ['/tmp/eval_review_']);
  assert.ok(issues.some((i) => i.rule === 'no-absolute-paths'));
  assert.ok(issues.some((i) => i.rule === 'output-path-config'));
  assert.equal(issues.some((i) => i.rule === 'declared-output-path'), false);
});
test('a resolved exact output still passes with a warning', () => {
  const issues = check('Write `/tmp/eval_review_pdf.html`.', ['/tmp/eval_review_pdf.html']);
  assert.equal(errors(issues).length, 0);
  assert.ok(issues.some((i) => i.rule === 'declared-output-path'));
});
test('literal dot filename and longer input retain exact behavior', () => {
  const issues = check('Write `/tmp/report.` then read `/tmp/report.secret`.', ['/tmp/report.']);
  assert.equal(errors(issues).length, 1);
  assert.ok(errors(issues)[0].message.includes('/tmp/report.secret'));
});
test('linked input is never exempted', () => {
  assert.ok(check('[Input](/tmp/report.html)', ['/tmp/report.html']).some((i) => i.rule === 'no-absolute-paths'));
});
test('mixed literal output and templated input retains input failure', () => {
  const issues = check('Write `/tmp/report.html`. Read `/home/<user>/input.csv`.', ['/tmp/report.html']);
  assert.equal(errors(issues).length, 1);
  assert.ok(errors(issues)[0].message.includes('/home/<user>/input.csv'));
});
