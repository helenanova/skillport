import { loadSkill } from './skill.js';
import { runStaticChecks } from './checks/static.js';
import { smokeTest } from './checks/smoke.js';
import { HARNESSES, DEFAULT_HARNESSES } from './harnesses/index.js';

export async function checkSkill(skillDir, options = {}) {
  const harnessIds = options.harnesses || DEFAULT_HARNESSES;
  const runSmoke = options.smoke !== false;

  let skill;
  try {
    skill = await loadSkill(skillDir);
  } catch (err) {
    return {
      skillDir,
      skillName: null,
      ok: false,
      fatal: err.message,
      static: { issues: [{ level: 'error', rule: 'load', message: err.message }] },
      harnesses: {},
      summary: { errors: 1, warnings: 0 },
    };
  }

  const staticIssues = runStaticChecks(skill, { outputPaths: options.outputPaths || [] });
  const harnesses = {};

  for (const id of harnessIds) {
    const harness = HARNESSES[id];
    if (!harness) {
      throw new Error(`unknown harness "${id}". Known: ${DEFAULT_HARNESSES.join(', ')}`);
    }
    const issues = skill.hasSkillMd ? harness.staticChecks(skill) : [];
    const result = { label: harness.label, issues, steps: [], ok: true, smokeTested: false };
    if (runSmoke && harness.smoke && skill.escapingSymlinks.length === 0) {
      result.smokeTested = true;
      result.steps = await smokeTest(skill, harness);
    }
    const failed =
      issues.some((i) => i.level === 'error') ||
      result.steps.some((s) => s.ok === false) ||
      staticIssues.some((i) => i.level === 'error');
    result.ok = !failed;
    harnesses[id] = result;
  }

  const allIssues = [
    ...staticIssues,
    ...Object.values(harnesses).flatMap((h) => h.issues),
  ];
  const errors = allIssues.filter((i) => i.level === 'error').length +
    Object.values(harnesses).flatMap((h) => h.steps).filter((s) => s.ok === false).length;
  const warnings = allIssues.filter((i) => i.level === 'warning').length;

  return {
    skillDir,
    skillName: skill.frontmatter.name || skill.dirName,
    ok: errors === 0,
    static: { issues: staticIssues },
    harnesses,
    summary: { errors, warnings },
  };
}

// Suppress known issues listed in a baseline file. A suppression matches on
// rule (required), exact file (optional) and message substring (optional).
// Suppressed issues are moved to report.baselined, never silently dropped.
// Pass a shared `used` set to track consumed entries across several reports.
export function applyBaseline(report, suppressions, used = new Set()) {
  const baselined = [];
  const suppress = (issues) => (issues || []).filter((issue) => {
    const idx = suppressions.findIndex((s, i) => !used.has(i) &&
      s.rule === issue.rule &&
      (!s.file || s.file === issue.file) &&
      (!s.message || (issue.message || '').includes(s.message)));
    if (idx === -1) return true;
    used.add(idx);
    baselined.push(issue);
    return false;
  });

  const next = { ...report, static: { ...report.static, issues: suppress(report.static?.issues) } };
  const harnesses = {};
  for (const [id, h] of Object.entries(report.harnesses || {})) {
    const issues = suppress(h.issues);
    const failed =
      issues.some((i) => i.level === 'error') ||
      (h.steps || []).some((s) => s.ok === false) ||
      next.static.issues.some((i) => i.level === 'error');
    harnesses[id] = { ...h, issues, ok: !failed };
  }
  next.harnesses = harnesses;
  next.baselined = [...(report.baselined || []), ...baselined];

  const allIssues = [...next.static.issues, ...Object.values(harnesses).flatMap((h) => h.issues)];
  const errors = allIssues.filter((i) => i.level === 'error').length +
    Object.values(harnesses).flatMap((h) => h.steps || []).filter((s) => s.ok === false).length;
  const warnings = allIssues.filter((i) => i.level === 'warning').length;
  next.summary = { errors, warnings };
  next.ok = errors === 0;
  return next;
}

export { DEFAULT_HARNESSES };
