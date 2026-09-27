---
name: valid-full
description: Generates weekly status reports from a project ledger and formats them for email.
allowed-tools:
  - Bash
  - Read
---

# Valid Full

Use this skill when the user asks for a weekly status report.

1. Read the ledger.
2. Follow the formatting rules in [the format guide](references/format.md).
3. Run `scripts/build-report.js` to render the report.
