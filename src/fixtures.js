import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// npm tarballs omit symlinks. Rebuild this negative demo fixture in an owned
// temporary directory, never in the source checkout or installed package.
export async function withFixture(fixturesDir, name, inspect) {
  const source = path.join(fixturesDir, name);
  if (name !== 'symlink-escape') return inspect(source);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillport-fixture-'));
  try {
    const target = path.join(temp, name);
    await fs.cp(source, target, { recursive: true, dereference: false });
    await fs.mkdir(path.join(target, 'scripts'), { recursive: true });
    const link = path.join(target, 'scripts/escape.sh');
    await fs.rm(link, { force: true });
    const outside = path.join(temp, 'outside.sh');
    await fs.writeFile(outside, '#!/bin/sh\nexit 0\n');
    await fs.symlink(outside, link);
    return await inspect(target);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
