const CHECK = '✓';
const CROSS = '✗';

export function formatText(result) {
  const lines = [];
  const title = result.skillName || result.skillDir;
  lines.push(`SkillPort portability report: ${title}`);
  lines.push('');

  if (result.fatal) {
    lines.push(`  ${CROSS} ${result.fatal}`);
    return lines.join('\n');
  }

  const staticErrors = result.static.issues.filter((i) => i.level === 'error');
  const staticWarnings = result.static.issues.filter((i) => i.level === 'warning');
  lines.push(`Format checks:  ${staticErrors.length === 0 ? `${CHECK} clean` : `${CROSS} ${staticErrors.length} error(s)`}${staticWarnings.length ? `, ${staticWarnings.length} warning(s)` : ''}`);
  for (const i of result.static.issues) {
    lines.push(`  ${i.level === 'error' ? CROSS : '!'} [${i.rule}] ${i.message}`);
  }
  lines.push('');

  lines.push('Harness compatibility:');
  for (const [, h] of Object.entries(result.harnesses)) {
    const mode = h.smokeTested ? 'static + smoke' : 'static only';
    lines.push(`  ${h.ok ? CHECK : CROSS} ${h.label.padEnd(12)} (${mode})`);
    for (const i of h.issues) {
      lines.push(`    ${i.level === 'error' ? CROSS : '!'} [${i.rule}] ${i.message}`);
    }
    for (const s of h.steps) {
      if (s.ok && (s.name === 'harness-cli' || s.name === 'stage')) continue; // keep output tight
      lines.push(`    ${s.ok ? CHECK : CROSS} ${s.name}: ${s.detail}`);
    }
  }
  lines.push('');
  lines.push(result.ok
    ? `Result: PASS - SkillPort checks pass for ${Object.keys(result.harnesses).length} harnesses (${result.summary.warnings} warning(s))`
    : `Result: FAIL - ${result.summary.errors} error(s), ${result.summary.warnings} warning(s)`);
  return lines.join('\n');
}

export function formatMarkdown(result) {
  const lines = [];
  lines.push(`## SkillPort portability report: \`${result.skillName || result.skillDir}\``);
  lines.push('');
  if (result.fatal) {
    lines.push(`**FAIL** - ${result.fatal}`);
    return lines.join('\n');
  }
  lines.push('| Harness | Mode | Result |');
  lines.push('| --- | --- | --- |');
  for (const [, h] of Object.entries(result.harnesses)) {
    lines.push(`| ${h.label} | ${h.smokeTested ? 'static + smoke' : 'static only'} | ${h.ok ? '✅ pass' : '❌ fail'} |`);
  }
  lines.push('');
  const issues = [
    ...result.static.issues.map((i) => ({ ...i, where: 'format' })),
    ...Object.entries(result.harnesses).flatMap(([, h]) => [
      ...h.issues.map((i) => ({ ...i, where: h.label })),
      ...h.steps.filter((s) => s.ok === false).map((s) => ({
        level: 'error', rule: 'smoke', message: `${s.name}: ${s.detail}`, where: h.label,
      })),
    ]),
  ];
  if (issues.length > 0) {
    lines.push('| Level | Where | Rule | Problem |');
    lines.push('| --- | --- | --- | --- |');
    for (const i of issues) {
      lines.push(`| ${i.level} | ${i.where} | \`${i.rule}\` | ${i.message.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  lines.push(result.ok ? '**Result: PASS**' : `**Result: FAIL** - ${result.summary.errors} error(s)`);
  return lines.join('\n');
}
