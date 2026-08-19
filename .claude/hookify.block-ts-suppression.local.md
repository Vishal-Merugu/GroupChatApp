---
name: block-ts-suppression
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: '@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable.*no-explicit-any'
---

**Do not suppress the type checker or the `any` rule.**

A suppression comment is the same failure as writing `any` — it asserts past the type system instead of describing the data. Decision 8 applies to both.

Fix the type: narrow with a guard, validate with zod, or write a local interface for the third-party shape you actually use.
