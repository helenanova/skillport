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
  };
  const raw = await fs.readFile(skill.skillMdPath, 'utf8').catch(() => null);
  if (raw !== null) {
    skill.hasSkillMd = true;
    skill.raw = raw;
    const parsed = parseFrontmatter(raw);
    skill.frontmatter = parsed.data;
    skill.body = parsed.body;
    skill.frontmatterErrors = parsed.errors;
  }
  skill.files = await walk(root, root);
  return skill;
}

async function walk(dir, root) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      out.push(...(await walk(full, root)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

// Local file references inside SKILL.md: markdown links plus
// `references/...` and `scripts/...` path mentions in prose.
export function extractReferences(skill) {
  if (!skill.raw) return [];
  const refs = new Set();
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = linkRe.exec(skill.raw)) !== null) {
    const target = m[1];
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith('#') || target.startsWith('mailto:')) continue;
    refs.add(target.split('#')[0]);
  }
  const pathRe = /\b((?:references|scripts|assets|examples)\/[\w./-]+)/g;
  while ((m = pathRe.exec(skill.raw)) !== null) {
    refs.add(m[1]);
  }
  return [...refs].filter(Boolean);
}
