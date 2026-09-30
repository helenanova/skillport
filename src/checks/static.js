import path from 'node:path';
import { extractReferences } from '../skill.js';

// Harness-agnostic format checks. Each rule returns zero or more issues:
// { level: 'error'|'warning', rule, message, file? }

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

export function runStaticChecks(skill, { outputPaths = [] } = {}) {
  const issues = [];
  const push = (level, rule, message, file) => issues.push({ level, rule, message, file });

  if (!skill.hasSkillMd) {
    push('error', 'skill-md-exists', 'SKILL.md is missing at the skill root');
    return issues; // everything else depends on the manifest
  }

  for (const err of skill.frontmatterErrors) {
    push('error', 'frontmatter-parse', `frontmatter: ${err}`, 'SKILL.md');
  }

  const { name, description } = skill.frontmatter;

  if (!name) {
    push('error', 'frontmatter-name', 'frontmatter is missing required key `name`', 'SKILL.md');
  } else {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      push('error', 'name-format', `name "${name}" must be lowercase letters, digits and hyphens (e.g. pdf-tools)`, 'SKILL.md');
    }
    if (name.length > MAX_NAME) {
      push('error', 'name-length', `name is ${name.length} chars; harnesses cap it at ${MAX_NAME}`, 'SKILL.md');
    }
    if (name !== skill.dirName) {
      push('warning', 'name-dir-mismatch', `name "${name}" does not match the directory "${skill.dirName}"; some harnesses key skills by directory`, 'SKILL.md');
    }
  }

  if (!description) {
    push('error', 'frontmatter-description', 'frontmatter is missing required key `description`', 'SKILL.md');
  } else if (typeof description === 'string') {
    if (description.length > MAX_DESCRIPTION) {
      push('error', 'description-length', `description is ${description.length} chars; over the ${MAX_DESCRIPTION} char limit`, 'SKILL.md');
    }
    if (description.length < 20) {
      push('warning', 'description-thin', 'description is very short; harnesses use it to decide when to load the skill', 'SKILL.md');
    }
  }

  if (!skill.body || skill.body.trim().length === 0) {
    push('warning', 'body-empty', 'SKILL.md has no body below the frontmatter', 'SKILL.md');
  }

  // Referenced local files must exist.
  const refs = extractReferences(skill);
  const fileSet = new Set(skill.files);
  for (const ref of refs) {
    if (path.isAbsolute(ref) || /^[A-Za-z]:[\\/]/.test(ref)) {
      push('error', 'no-absolute-paths', `absolute path reference "${ref}" will not resolve on another machine`, 'SKILL.md');
      continue;
    }
    if (ref.startsWith('..')) {
      push('error', 'no-parent-escape', `reference "${ref}" escapes the skill directory`, 'SKILL.md');
      continue;
    }
    if (!fileSet.has(ref)) {
      push('error', 'ref-exists', `referenced file "${ref}" does not exist in the skill`, 'SKILL.md');
    }
  }

  // Explicit exact-path output declarations, never inferred from nearby verbs.
  const validOutputs = new Set();
  if (!Array.isArray(outputPaths)) {
    push('error', 'output-path-config', 'outputPaths must be an array of exact /tmp/ file paths');
  } else {
    for (const output of outputPaths) {
      if (typeof output !== 'string' || !/^\/tmp\/[\w./-]+$/.test(output) ||
          output.endsWith('/') || path.posix.normalize(output) !== output ||
          output.split('/').includes('..')) {
        push('error', 'output-path-config', 'output paths must be exact normalized /tmp/ file paths, without globs or parent escapes');
      } else validOutputs.add(output);
    }
  }
  const usedOutputs = new Set();

  // Absolute paths anywhere in the manifest body (machine-specific).
  const absBody = skill.raw.match(/(?<![\w/.-])\/(?:Users|home|opt|var|tmp)\/[\w./-]+/g);
  if (absBody) {
    for (const p of absBody) {
      if (validOutputs.has(p)) {
        usedOutputs.add(p);
        push('warning', 'declared-output-path', `"${p}" is explicitly declared as generated output; input use is not verified`, 'SKILL.md');
      } else {
        push('error', 'no-absolute-paths', `absolute path "${p}" is machine-specific`, 'SKILL.md');
      }
    }
  }

  for (const output of validOutputs) {
    if (!usedOutputs.has(output)) push('error', 'output-path-config', `declared output "${output}" does not occur in SKILL.md`);
  }

  // Symlinks escaping the skill root break installers and can expose local files.
  for (const f of skill.escapingSymlinks) {
    push('error', 'symlink-escape', `symlink "${f}" points outside the skill directory or is broken`);
  }
  if (skill.frontmatter.compatibility !== undefined &&
      (typeof skill.frontmatter.compatibility !== 'string' ||
       skill.frontmatter.compatibility.length === 0 ||
       skill.frontmatter.compatibility.length > 500)) {
    push('error', 'compatibility-format', 'compatibility must be a non-empty string of at most 500 characters', 'SKILL.md');
  }
  const metadata = skill.frontmatter.metadata;
  if (metadata !== undefined &&
      (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata) ||
       Object.values(metadata).some((v) => typeof v !== 'string' || v.length === 0))) {
    push('error', 'metadata-format', 'metadata must be a map of non-empty string values', 'SKILL.md');
  }
  for (const f of skill.files) {
    if (f.includes('\0')) push('error', 'filename-sane', `filename contains NUL: ${f}`);
  }

  return issues;
}
