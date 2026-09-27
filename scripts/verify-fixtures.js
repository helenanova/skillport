// Runs SkillPort against every bundled fixture and asserts the expected
// outcome from fixtures/expected.json. Used by CI and `npm run check:fixtures`.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSkill } from '../src/index.js';
import { formatMarkdown } from '../src/report.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixturesDir = path.join(root, 'fixtures');
const expected = JSON.parse(await fs.readFile(path.join(fixturesDir, 'expected.json'), 'utf8'));

let failures = 0;
const reports = [];

for (const [name, want] of Object.entries(expected)) {
  const result = await checkSkill(path.join(fixturesDir, name));
  reports.push(result);
  const gotRules = result.static.issues.map((i) => i.rule);
  const gotSteps = Object.values(result.harnesses).flatMap((h) =>
    h.steps.filter((s) => s.ok === false).map((s) => s.name));
  const problems = [];
  if (result.ok !== want.ok) problems.push(`expected ok=${want.ok}, got ok=${result.ok}`);
  for (const rule of want.rules || []) {
    if (!gotRules.includes(rule)) problems.push(`expected rule "${rule}" in [${gotRules.join(', ')}]`);
  }
  for (const step of want.steps || []) {
    if (!gotSteps.includes(step)) problems.push(`expected failing step "${step}" in [${gotSteps.join(', ')}]`);
  }
  if (problems.length > 0) {
    failures++;
    console.error(`FAIL ${name}`);
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// Emit a combined Markdown report for the GitHub Actions job summary.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['# SkillPort fixture matrix', ''];
  for (const r of reports) md.push(formatMarkdown(r), '');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
}

if (failures > 0) {
  console.error(`${failures} fixture expectation(s) failed`);
  process.exit(1);
}
console.log(`all ${Object.keys(expected).length} fixtures behave as expected`);
