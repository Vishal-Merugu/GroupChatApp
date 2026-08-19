---
name: block-console-log
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: (apps|packages)/.*\.tsx?$
  - field: new_text
    operator: regex_match
    pattern: '\bconsole\.(log|error|warn|info|debug)\('
---

**Use `logger` from `apps/server/src/utils/logger.ts`, not `console`.**

`console.log(err)` was the original codebase's universal error handler and it lost every piece of context that made a failure actionable. The structured logger records level, timestamp, and request context in a greppable form.

If you are logging an error inside a `catch`, check first that you should not simply be throwing an `AppError` instead.
