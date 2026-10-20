import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { checkSkill, DEFAULT_HARNESSES } from './index.js';
import { formatText, formatMarkdown } from './report.js';
import { formatSarif } from './sarif.js';
import { withFixture } from './fixtures.js';

const FIXTURE_FLAGS = new Set(['--json']);
const CHECK_FLAGS = new Set(['--json', '--markdown', '--sarif', '--no-smoke']);
const CHECK_VALUE_FLAGS = new Set(['--harness', '--out', '--output-path']);

function unknownOption(args, flags, valueFlags) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) continue;
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (!flags.has(arg)) return arg;
  }
  return null;
}

const HELP = `SkillPort - portability test for agent skills

Usage:
  skillport check <skill-dir> [options]   Test one skill across agent harnesses
  skillport fixtures [--json]             Run the bundled example fixtures (demo/self-test)
  skillport --version                     Print version
  skillport --help                        This help

Options for "check":
  --harness <a,b,c>   Harnesses to test (default: ${DEFAULT_HARNESSES.join(',')})
  --output-path <path> Declare an exact generated /tmp/ output path (repeatable; warns)
  --no-smoke          Skip smoke tests (static checks only)
  --json              Machine-readable report to stdout
  --markdown          GitHub-Flavored Markdown report to stdout
  --sarif             SARIF 2.1.0 report (code scanning / PR annotations) to stdout
  --out <file>        Also write the chosen report to a file

Exit codes: 0 = pass, 1 = portability errors, 2 = usage error
`;

async function packageVersion() {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}

export async function main(argv) {
  const args = argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('-'));

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${await packageVersion()}\n`);
    return 0;
  }

  if (!cmd) {
    process.stdout.write(HELP);
    return 2;
  }

  const json = args.includes('--json');
  const markdown = args.includes('--markdown');
  const sarif = args.includes('--sarif');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  if (cmd === 'fixtures') {
    const unknown = unknownOption(args, FIXTURE_FLAGS, new Set());
    if (unknown) {
      process.stderr.write(`error: unknown option ${JSON.stringify(unknown)} for "fixtures"\n`);
      return 2;
    }
    const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
    const entries = (await fs.readdir(fixturesDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const results = [];
    for (const name of entries) {
      results.push(await withFixture(fixturesDir, name, async (dir) => {
        const report = await checkSkill(dir);
        // The temporary reconstruction is removed before the report is shown.
        report.skillDir = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
        return report;
      }));
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
    const unknown = unknownOption(args, CHECK_FLAGS, CHECK_VALUE_FLAGS);
    if (unknown) {
      process.stderr.write(`error: unknown option ${JSON.stringify(unknown)} for "check"\n`);
      return 2;
    }
    const hIdx = args.indexOf('--harness');
    if (hIdx !== -1 && (!args[hIdx + 1] || args[hIdx + 1].startsWith('-'))) {
      process.stderr.write('error: --harness needs a comma-separated harness list\n');
      return 2;
    }
    if (outIdx !== -1 && (!outFile || outFile.startsWith('-'))) {
      process.stderr.write('error: --out needs a report file path\n');
      return 2;
    }
    const harnesses = hIdx !== -1 ? args[hIdx + 1].split(',').map((s) => s.trim()) : undefined;
    const smoke = !args.includes('--no-smoke');

    const outputPaths = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--output-path') {
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          process.stderr.write('error: --output-path needs an exact /tmp/ file path\n');
          return 2;
        }
        outputPaths.push(args[++i]);
      }
    }
    let result;
    try {
      result = await checkSkill(target, { harnesses, smoke, outputPaths });
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }

    const rendered = json ? JSON.stringify(result, null, 2)
      : sarif ? formatSarif(result, { version: await packageVersion() })
      : markdown ? formatMarkdown(result) : formatText(result);
    process.stdout.write(rendered + '\n');
    if (outFile) {
      try {
        await fs.writeFile(outFile, rendered + '\n');
      } catch (err) {
        process.stderr.write(`error: cannot write report to ${JSON.stringify(outFile)}: ${err.code || err.message}\n`);
        return 2;
      }
    }
    return result.ok ? 0 : 1;
  }

  process.stderr.write(`error: unknown command "${cmd}"\n\n` + HELP);
  return 2;
}
