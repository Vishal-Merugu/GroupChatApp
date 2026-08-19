---
name: block-legacy-backend-edit
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: ^.*/Backend/.*$
---

**`Backend/` is the original JavaScript app, kept as a read-only reference.**

The rebuild lives in `apps/server/`. Editing the legacy tree does nothing for the running application and muddies the migration story the project exists to demonstrate.

Read it to compare behaviour; make the change in `apps/server/`. `Backend/` is deleted once Stage A is signed off.
