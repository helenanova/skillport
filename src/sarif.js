// SARIF 2.1.0 report for code scanning and PR annotations. Additive output;
// the text, JSON and Markdown reports are unchanged.

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

function sarifLevel(level) {
  return level === 'error' ? 'error' : 'warning';
}

export function formatSarif(result, { version } = {}) {
  const fallbackUri = result.skillName || result.skillDir || 'SKILL.md';
  const rules = new Map();
  const results = [];

  const addIssue = (issue) => {
    if (!rules.has(issue.rule)) rules.set(issue.rule, { id: issue.rule });
    const physicalLocation = {
      artifactLocation: { uri: issue.file || fallbackUri },
    };
    if (typeof issue.line === 'number') {
      physicalLocation.region = { startLine: issue.line };
      if (typeof issue.column === 'number') physicalLocation.region.startColumn = issue.column;
    }
    results.push({
      ruleId: issue.rule,
      level: sarifLevel(issue.level),
      message: { text: issue.message },
      locations: [{ physicalLocation }],
    });
  };

  if (result.fatal) {
    addIssue({ level: 'error', rule: 'load', message: result.fatal, file: result.skillDir });
    return render(result, version, rules, results);
  }

  for (const issue of result.static?.issues || []) addIssue(issue);
  for (const harness of Object.values(result.harnesses || {})) {
    for (const issue of harness.issues || []) addIssue(issue);
    for (const step of (harness.steps || []).filter((s) => s.ok === false)) {
      addIssue({ level: 'error', rule: 'smoke', message: `${harness.label}: ${step.name}: ${step.detail}` });
    }
  }
  return render(result, version, rules, results);
}

function render(result, version, rules, results) {
  const driver = {
    name: 'SkillPort',
    informationUri: 'https://github.com/helenanova/skillport',
    rules: [...rules.values()],
  };
  if (version) driver.version = version;
  return JSON.stringify({
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: { driver },
      results,
      properties: { skill: result.skillName || result.skillDir, ok: result.ok !== false },
    }],
  }, null, 2);
}
