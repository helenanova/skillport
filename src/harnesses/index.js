// Harness adapters. Each adapter knows:
//  - where the harness expects a skill to live (layout)
//  - harness-specific static rules
//  - whether this MVP smoke-tests it by staging + loading in a sandbox
//
// Format knowledge is grounded in each harness's public docs:
//  - Claude Code: ~/.claude/skills/<name>/SKILL.md, frontmatter name + description
//  - Codex:       ~/.codex/skills/<name>/SKILL.md, same manifest shape
//  - Cursor:      .cursor/rules/*.mdc, frontmatter description + alwaysApply/globs

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const HARNESSES = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    cli: 'claude',
    smoke: true,
    layout: (sandbox, name) => `${sandbox}/.claude/skills/${name}`,
    staticChecks(skill) {
      const issues = [];
      const name = skill.frontmatter.name;
      if (name && name !== skill.dirName) {
        issues.push({
          level: 'error', rule: 'cc-name-matches-dir',
          message: `Claude Code keys the skill by directory: dir "${skill.dirName}" != name "${name}"`,
        });
      }
      const at = skill.frontmatter['allowed-tools'];
      if (at !== undefined && !Array.isArray(at) && typeof at !== 'string') {
        issues.push({ level: 'error', rule: 'cc-allowed-tools', message: '`allowed-tools` must be a string or list' });
      }
      return issues;
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    cli: 'codex',
    smoke: true,
    layout: (sandbox, name) => `${sandbox}/.codex/skills/${name}`,
    staticChecks(skill) {
      const issues = [];
      // Codex parses the manifest strictly: any parse error is fatal there.
      for (const err of skill.frontmatterErrors) {
        issues.push({ level: 'error', rule: 'cx-strict-frontmatter', message: `strict manifest parse fails: ${err}` });
      }
      const name = skill.frontmatter.name;
      if (name && typeof name === 'string' && !NAME_RE.test(name)) {
        issues.push({ level: 'error', rule: 'cx-name-format', message: `name "${name}" is not a valid skill slug for Codex` });
      }
      return issues;
    },
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    cli: 'cursor-agent',
    smoke: false, // static-only in this MVP: Cursor consumes converted .mdc rules
    layout: (sandbox, name) => `${sandbox}/.cursor/rules/${name}.mdc`,
    staticChecks(skill) {
      const issues = [];
      if (!skill.frontmatter.description) {
        issues.push({ level: 'error', rule: 'cu-description', message: 'converted .mdc rule needs a description frontmatter key' });
      }
      if (skill.hasSkillMd && (!skill.body || skill.body.trim().length === 0)) {
        issues.push({ level: 'error', rule: 'cu-body', message: 'converted .mdc rule would be empty: SKILL.md has no body' });
      }
      return issues;
    },
  },
};

export const DEFAULT_HARNESSES = Object.keys(HARNESSES);
