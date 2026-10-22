// Minimal YAML-frontmatter parser for SKILL.md files.
// Supports scalar keys, block lists, one-level metadata mappings, block
// scalars (| and > with - and + chomping), inline lists and inline maps,
// and boolean/null scalar coercion. Numbers and dates stay strings.
// Not a general YAML parser - documented MVP trade-off in README.

function parseScalar(value) {
  const quoted = /^["']/.test(value);
  const stripped = value.replace(/^["']|["']$/g, '');
  if (quoted) return stripped;
  if (stripped === 'true') return true;
  if (stripped === 'false') return false;
  if (stripped === 'null' || stripped === '~') return null;
  return stripped; // numbers and dates intentionally stay strings
}

function splitTopLevel(inner) {
  const parts = [];
  let current = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseInlineList(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner).map((el) => parseScalar(el.trim()));
}

// Returns { map } or { error: key } when a value nests another collection.
function parseInlineMap(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return { map: {} };
  const map = {};
  for (const entry of splitTopLevel(inner)) {
    const colon = entry.indexOf(':');
    if (colon === -1) return { error: entry.trim() };
    const key = entry.slice(0, colon).trim().replace(/^["']|["']$/g, '');
    const raw = entry.slice(colon + 1).trim();
    if (raw.startsWith('[') || raw.startsWith('{')) return { error: entry.trim() };
    if (Object.hasOwn(map, key)) return { error: entry.trim() };
    map[key] = parseScalar(raw);
  }
  return { map };
}

function parseBlockScalar(indicator, lines, startIndex) {
  const folded = indicator[0] === '>';
  const chomp = indicator[1] || 'clip';
  const block = [];
  let end = startIndex;
  while (end < lines.length) {
    const bl = lines[end];
    if (bl.trim() === '' || /^[ \t]/.test(bl)) {
      block.push(bl);
      end++;
      continue;
    }
    break;
  }
  let minIndent = Infinity;
  for (const bl of block) {
    if (bl.trim() === '') continue;
    const indent = bl.match(/^[ \t]*/)[0].length;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent === Infinity) minIndent = 0;
  const stripped = block.map((bl) => (bl.trim() === '' ? '' : bl.slice(minIndent)));
  let text;
  if (folded) {
    let out = '';
    for (const l of stripped) {
      if (l === '') {
        out += '\n';
      } else {
        if (out !== '' && !out.endsWith('\n')) out += ' ';
        out += l;
      }
    }
    text = out;
  } else {
    text = stripped.join('\n');
  }
  const trailingBreaks = text.match(/\n*$/)?.[0].length ?? 0;
  text = text.replace(/\n+$/, '');
  if (chomp === '+') text += '\n'.repeat(trailingBreaks + 1);
  else if (chomp !== '-') text += '\n';
  return { text, endIndex: end - 1 };
}

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
  const raw = markdown.slice(rawStart, rawEnd).replace(/\r?\n$/, '');
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
    const rawValue = kv[2].trim();
    if (/^[|>][+-]?$/.test(rawValue)) {
      const block = parseBlockScalar(rawValue, lines, lineIndex + 1);
      result.data[kv[1]] = block.text;
      lineIndex = block.endIndex;
      currentKey = null; // a list after a block scalar is malformed YAML
      continue;
    }
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      result.data[kv[1]] = parseInlineList(rawValue);
      continue;
    }
    if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
      const parsed = parseInlineMap(rawValue);
      if (parsed.error) {
        fail(`unsupported nested collection in frontmatter line: ${line.trim()}`, lineNumber);
        delete result.data[kv[1]];
        delete result.keyLines[kv[1]];
        currentKey = null;
        continue;
      }
      result.data[kv[1]] = parsed.map;
      continue;
    }
    result.data[currentKey] = rawValue === '' ? [] : parseScalar(rawValue);
  }
  return result;
}
