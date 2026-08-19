---
description: Run the full quality gate (tsc + lint + tests) and fix everything it reports
---

Run the gate from the repo root and fix what it finds. Do not report success until all three pass clean.

```bash
npm run tsc
npm run lint
npm test
```

Then verify what the gates cannot:

```bash
grep -rn ': any\|<any>\|as any\|@ts-ignore\|@ts-expect-error' apps packages --include=*.ts
```

Matches inside comments explaining the rule are fine; anything else is a Decision 8 violation and must be fixed, not suppressed.

## Rules while fixing

- Fix the cause, never silence the check. No `eslint-disable`, no `@ts-expect-error`, no widening a type to make an error disappear.
- If a test fails, decide honestly whether the test or the code is wrong, and say which you concluded. Never edit a test purely to make it pass.
- Re-run the full gate after fixing — fixes routinely surface new failures.

## Report

State the actual final status of each gate. If something still fails, say so and show the output rather than describing it as nearly done. If you skipped anything, say what and why.
