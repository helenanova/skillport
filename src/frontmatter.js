// Minimal YAML-frontmatter parser for SKILL.md files.
// Supports the subset agent-skill manifests actually use:
// scalar keys (`name: foo`), and block lists (`key:\n  - a\n  - b`).
// Not a general YAML parser - documented MVP trade-off in README.

export function parseFrontmatter(markdown) {
  const result = { data: {}, body: markdown, errors: [] };
  if (!markdown.startsWith('---')) {
    result.errors.push('no frontmatter block at the top of the file');
    return result;
  }
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) {
    result.errors.push('frontmatter block is not closed with a --- line');
    return result;
  }
  const raw = markdown.slice(3, end).trim();
  result.body = markdown.slice(end + 4).replace(/^\r?\n/, '');
  const lines = raw.split(/\r?\n/);
  let currentKey = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(result.data[currentKey])) result.data[currentKey] = [];
      result.data[currentKey].push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      result.errors.push(`unparseable frontmatter line: ${line.trim()}`);
      continue;
    }
    currentKey = kv[1];
    const value = kv[2].trim().replace(/^["']|["']$/g, '');
    result.data[currentKey] = value === '' ? [] : value;
  }
  return result;
}
