// Minimal YAML-frontmatter parser for SKILL.md files.
// Supports scalar keys, block lists, and one-level metadata mappings.
// Not a general YAML parser - documented MVP trade-off in README.

export function parseFrontmatter(markdown) {
  const result = { data: {}, body: markdown, errors: [], keyLines: {}, metadataKeyLines: {} };
  // Errors are { message, line } with a 1-based line in SKILL.md.
  const fail = (message, line = 1) => result.errors.push({ message, line });
  const firstBreak = markdown.indexOf('\n');
  const firstLine = (firstBreak === -1 ? markdown : markdown.slice(0, firstBreak)).replace(/\r$/, '');
  if (firstLine !== '---') {
    fail('no frontmatter block at the top of the file');
    return result;
  }
  if (firstBreak === -1) {
    fail('frontmatter block is not closed with a --- line');
    return result;
  }

  const rawStart = firstBreak + 1;
  let lineStart = rawStart;
  let rawEnd = -1;
  let bodyStart = markdown.length;
  while (lineStart <= markdown.length) {
    const nextBreak = markdown.indexOf('\n', lineStart);
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
    const line = markdown.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (line === '---') {
      rawEnd = lineStart;
      bodyStart = nextBreak === -1 ? markdown.length : nextBreak + 1;
      break;
    }
    if (nextBreak === -1) break;
    lineStart = nextBreak + 1;
  }
  if (rawEnd === -1) {
    fail('frontmatter block is not closed with a --- line');
    return result;
  }
  const raw = markdown.slice(rawStart, rawEnd).trim();
  result.body = markdown.slice(bodyStart);
  const lines = raw.split(/\r?\n/);
  let currentKey = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 2; // line 1 is the opening --- delimiter
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(result.data[currentKey])) result.data[currentKey] = [];
      result.data[currentKey].push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const mapItem = line.match(/^  ([A-Za-z0-9_-]+):\s*(.*)$/);
    if (mapItem && currentKey === 'metadata') {
      if (Array.isArray(result.data.metadata) && result.data.metadata.length === 0) {
        result.data.metadata = {};
      }
      if (typeof result.data.metadata !== 'object' || Array.isArray(result.data.metadata)) {
        fail(`unparseable frontmatter line: ${line.trim()}`, lineNumber);
        continue;
      }
      if (Object.hasOwn(result.data.metadata, mapItem[1])) {
        fail(`duplicate metadata key "${mapItem[1]}"`, lineNumber);
        continue;
      }
      result.metadataKeyLines[mapItem[1]] = lineNumber;
      result.data.metadata[mapItem[1]] = mapItem[2].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      fail(`unparseable frontmatter line: ${line.trim()}`, lineNumber);
      continue;
    }
    if (Object.hasOwn(result.data, kv[1])) {
      fail(`duplicate frontmatter key "${kv[1]}"`, lineNumber);
      continue;
    }
    currentKey = kv[1];
    result.keyLines[currentKey] = lineNumber;
    const value = kv[2].trim().replace(/^["']|["']$/g, '');
    result.data[currentKey] = value === '' ? [] : value;
  }
  return result;
}
