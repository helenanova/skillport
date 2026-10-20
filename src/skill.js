import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export async function loadSkill(skillDir) {
  const root = path.resolve(skillDir);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`skill path is not a directory: ${skillDir}`);
  }
  const skill = {
    root,
    dirName: path.basename(root),
    skillMdPath: path.join(root, 'SKILL.md'),
    hasSkillMd: false,
    raw: null,
    frontmatter: {},
    body: '',
    frontmatterErrors: [],
    files: [],
    escapingSymlinks: [],
  };
  let raw = null;
  try {
    raw = await fs.readFile(skill.skillMdPath, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') {
      throw new Error(`cannot read SKILL.md: ${err.message}`, { cause: err });
    }
  }
  if (raw !== null) {
    skill.hasSkillMd = true;
    skill.raw = raw;
    const parsed = parseFrontmatter(raw);
    skill.frontmatter = parsed.data;
    skill.body = parsed.body;
    skill.frontmatterErrors = parsed.errors;
  }
  // Compare symlink targets against the resolved root: on Windows realpath
  // expands 8.3 short names and case that os.tmpdir() may preserve.
  const realRoot = await fs.realpath(root).catch(() => root);
  skill.files = await walk(root, root, realRoot, skill.escapingSymlinks);
  return skill;
}

async function walk(dir, displayRoot, realRoot, escapingSymlinks) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      out.push(...(await walk(full, displayRoot, realRoot, escapingSymlinks)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const rel = path.relative(displayRoot, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        const real = await fs.realpath(full).catch(() => null);
        const norm = (p) => (process.platform === 'win32' && p ? p.toLowerCase() : p);
        const base = norm(realRoot);
        const target = norm(real);
        if (!target || (target !== base && !target.startsWith(base + path.sep))) {
          escapingSymlinks.push(rel);
        }
      }
      out.push(rel);
    }
  }
  return out.sort();
}

// 1-based line/column of a character offset, for diagnostics.
export function positionAt(source, index) {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: index - lastBreak };
}

// Local file references inside SKILL.md: markdown links plus
// `references/...` and `scripts/...` path mentions in prose.
// Each detail is { ref, line, column } with the first occurrence position.
export function extractReferenceDetails(skill) {
  if (!skill.raw) return [];
  const { source } = markedMarkdownExamples(skill.raw);
  const details = collectReferenceDetails(source);
  const seen = new Set(details.map((d) => d.ref));
  // A marked example never suppresses absolute or escaping links.
  for (const detail of collectReferenceDetails(skill.raw)) {
    const { ref } = detail;
    if ((path.isAbsolute(ref) || /^[A-Za-z]:[\\/]/.test(ref) || ref.startsWith('..')) && !seen.has(ref)) {
      seen.add(ref);
      details.push(detail);
    }
  }
  return details;
}

export function extractReferences(skill) {
  return extractReferenceDetails(skill).map((d) => d.ref);
}

function collectReferenceDetails(source) {
  const details = [];
  const seen = new Set();
  const add = (ref, index) => {
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    details.push({ ref, ...positionAt(source, index) });
  };
  const linkRe = /!?\[[^\]\n]*\]\(\s*(?:<((?:\\.|[^<>\n])+)>|((?:\\.|[^\s()])+))(?:\s+["'][^)]*["'])?\s*\)/g;
  let m;
  while ((m = linkRe.exec(source)) !== null) {
    let target = (m[1] ?? m[2]).replace(/\\([\s()#])/g, '$1');
    target = target.split('#')[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed percent escape remains literal and is checked as written.
    }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) && !/^[A-Za-z]:[\\/]/.test(target)) continue;
    if (!path.isAbsolute(target) && !/^[A-Za-z]:[\\/]/.test(target)) {
      target = path.posix.normalize(target);
    }
    add(target, m.index);
  }
  // Blank links with equal-length spaces so prose positions stay accurate.
  const proseSource = source.replace(linkRe, (match) => ' '.repeat(match.length));
  const pathRe = /\b((?:references|scripts|assets|examples)\/[\w./-]+)/g;
  while ((m = pathRe.exec(proseSource)) !== null) {
    add(m[1].replace(/[.,;:!?]+$/, ''), m.index);
  }
  return details;
}

// Exact author marker applies only to the immediately following balanced md fence.
export function markedMarkdownExamples(raw) {
  const lines = raw.split('\n');
  let fence = null;
  let count = 0;
  const markerLines = [];
  const appliedMarkers = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!fence) {
      if (lines[i].trim() === '<!-- skillport:example -->') markerLines.push(i);
      const m = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/.exec(lines[i]);
      if (!m || (m[2][0] === '`' && m[3].includes('`'))) continue;
      fence = { start: i, char: m[2][0], length: m[2].length,
        example: /^(md|markdown)$/i.test(m[3].trim()) && i > 0 &&
          lines[i - 1].trim() === '<!-- skillport:example -->' };
    } else {
      const close = /^( {0,3})(`+|~+)\s*$/.exec(lines[i]);
      if (!close || close[2][0] !== fence.char || close[2].length < fence.length) continue;
      if (fence.example) {
        for (let j = fence.start; j <= i; j++) lines[j] = '';
        count++;
        appliedMarkers.add(fence.start - 1);
      }
      fence = null;
    }
  }
  return { source: lines.join('\n'), count, ignoredMarkerLines: markerLines.filter((i) => !appliedMarkers.has(i)).map((i) => i + 1) };
}
