# SkillPort

**One agent skill. Every harness. Know exactly where it breaks.**

SkillPort is a portability test for agent skills. Point it at one skill folder
(`SKILL.md` + `references/` + `scripts/`) and it loads and runs that skill the
way each agent harness would - Claude Code, Codex, Cursor - and shows you the
exact compatibility errors instead of letting you find out after you publish.

![SkillPort demo: one skill, three harnesses, one red - then all green](docs/demo.svg)

A skill that loads fine in Claude Code can silently fail in Codex (strict
manifest parsing) or convert to an empty rule in Cursor (no body). SkillPort
answers one question: **does it actually run everywhere?**

## Quickstart

Requires Node.js 18+.

```bash
git clone https://github.com/helenanova/skillport.git
cd skillport
npm install

# test your skill
npx skillport check path/to/my-skill

# see it judge the bundled examples
npx skillport fixtures
```

Exit code is `0` when the skill loads on every harness, `1` when anything
breaks - so it drops straight into CI:

```yaml
- run: npx skillport check my-skill/
```

## What it checks

**Format checks (all harnesses)**

- `SKILL.md` exists and its frontmatter parses
- required `name` / `description` keys, name slug format and length caps
- every referenced file (`references/...`, `scripts/...`, markdown links) exists
- no absolute or machine-specific paths, no escaping the skill directory

**Harness rules**

| Harness | Mode in this MVP | What is verified |
| --- | --- | --- |
| Claude Code | static + smoke | directory/name keying, `allowed-tools` shape, staged load, scripts |
| Codex | static + smoke | strict manifest parse, slug rules, staged load, scripts |
| Cursor | static only | conversion to `.mdc` is possible (description, non-empty body) |

**Smoke test** (MVP definition): the skill is copied into a throwaway sandbox
at the path the harness expects (`~/.claude/skills/<name>`, `~/.codex/skills/<name>`),
re-loaded through the same discovery rules, and every declared script gets an
interpreter check plus a syntax check (`node --check`, `python3 -m py_compile`,
`bash -n`). Staging is emulated, so CI needs no vendor accounts; if a harness
CLI is installed locally SkillPort notes it. Native CLI invocations and
sandboxed script execution are on the roadmap below.

## Reports

```bash
npx skillport check my-skill --json       # machine-readable
npx skillport check my-skill --markdown   # GitHub-Flavored Markdown
npx skillport check my-skill --out report.md
```

The repo's own CI publishes the Markdown report for all ten bundled fixtures
to the GitHub Actions job summary on every push.

## The ten fixtures

`fixtures/` ships the failures we kept hitting by hand, so the tool is tested
against real breakage: missing `SKILL.md`, broken reference paths, missing
frontmatter, invalid names, absolute paths, script syntax errors, oversized
descriptions, declared-but-missing scripts - plus two known-good skills.
`npm run check:fixtures` asserts every fixture produces its expected verdict.

## What SkillPort is not

Not a marketplace, not a security scanner, not a skill registry. It answers
"does this skill actually load and run on each harness?" and stops there.

## Roadmap

- Native harness CLI smoke tests when `claude` / `codex` are present
- Sandboxed script execution (not just syntax checks) with timeouts
- More harnesses (Windsurf, Amp, OpenCode)
- `--fix` to auto-repair the common failures (missing refs, name format)

## Known MVP trade-offs

- The frontmatter parser covers the manifest subset skills actually use
  (scalars and block lists), not full YAML.
- Cursor support is static-only: Cursor consumes skills as converted rules,
  and the converter itself is on the roadmap.

## License

MIT
