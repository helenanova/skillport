#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`skillport: unexpected error: ${err.stack || err.message}\n`);
    process.exit(2);
  },
);
