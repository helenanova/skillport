import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let cached;

// Windows grants symlink creation only to elevated or developer-mode
// processes, so symlink-dependent tests probe once and skip when unsupported.
export async function symlinksSupported() {
  if (cached !== undefined) return cached;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-link-probe-'));
  try {
    await fs.symlink('target', path.join(dir, 'link'));
    cached = true;
  } catch {
    cached = false;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  return cached;
}

export const SYMLINK_SKIP = 'symlink creation requires elevated privileges on this platform';
