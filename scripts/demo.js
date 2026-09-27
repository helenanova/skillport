// The 3-second demo: one skill, three harnesses, one red - fixed, all green.
import { checkSkill } from '../src/index.js';
import { formatText } from '../src/report.js';

const broken = new URL('../fixtures/broken-reference-path', import.meta.url).pathname;
const fixed = new URL('../fixtures/valid-full', import.meta.url).pathname;

console.log('$ skillport check my-skill/   # before the fix\n');
console.log(formatText(await checkSkill(broken)));
console.log('\n# add the missing references/style-guide.md ...\n');
console.log('$ skillport check my-skill/   # after the fix\n');
console.log(formatText(await checkSkill(fixed)));
