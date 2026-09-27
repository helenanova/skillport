import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { checkSkill, DEFAULT_HARNESSES } from './index.js';
import { formatText, formatMarkdown } from './report.js';

const HELP = `SkillPort - portability test for agent skills

Usage:
  skillport check <skill-dir> [options]   Test one skill across agent harnesses
  skillport fixtures [--json]             Run the bundled example fixtures (demo/self-test)
  skillport --version                     Print version
  skillport --help                        This help

Options for "check":
  --harness <a,b,c>   Harnesses to test (default: ${DEFAULT_HARNESSES.join(',')})
  --no-smoke          Skip smoke tests (static checks only)
  --json              Machine-readable report to stdout
  --markdown          GitHub-Flavored Markdown report to stdout
  --out <file>        Also write the chosen report to a file

Exit codes: 0 = pass, 1 = portability errors, 2 = usage error
`;

export async function main(argv) {
  const args = argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('-'));

  if (args.includes('--help') || args.includes('-h') || !cmd) {
    process.stdout.write(HELP);
    return cmd || args.includes('--help') || args.includes('-h') ? 0 : 2;
  }
  if (args.includes('--version') || args.includes('-v')) {
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const json = args.includes('--json');
  const markdown = args.includes('--markdown');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  if (cmd === 'fixtures') {
    const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
    const entries = (await fs.readdir(fixturesDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const results = [];
    for (const name of entries) {
      results.push(await checkSkill(path.join(fixturesDir, name)));
    }
    if (json) {
      process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    } else {
      for (const r of results) {
        process.stdout.write(formatText(r) + '\n\n');
      }
    }
    return 0; // fixtures intentionally include failing cases
  }

  if (cmd === 'check') {
    const target = args[args.indexOf('check') + 1];
    if (!target || target.startsWith('-')) {
      process.stderr.write('error: "check" needs a skill directory\n\n' + HELP);
      return 2;
    }
    const hIdx = args.indexOf('--harness');
    const harnesses = hIdx !== -1 ? args[hIdx + 1].split(',').map((s) => s.trim()) : undefined;
    const smoke = !args.includes('--no-smoke');

    let result;
    try {
      result = await checkSkill(target, { harnesses, smoke });
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }

    const rendered = json ? JSON.stringify(result, null, 2) : markdown ? formatMarkdown(result) : formatText(result);
    process.stdout.write(rendered + '\n');
    if (outFile) {
      await fs.writeFile(outFile, rendered + '\n');
    }
    return result.ok ? 0 : 1;
  }

  process.stderr.write(`error: unknown command "${cmd}"\n\n` + HELP);
  return 2;
}
