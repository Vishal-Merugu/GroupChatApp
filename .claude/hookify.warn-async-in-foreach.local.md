---
name: warn-async-in-foreach
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: (apps|packages)/.*\.tsx?$
  - field: new_text
    operator: regex_match
    pattern: '\.forEach\(\s*async'
---

**`async` inside `forEach` does not wait.**

`forEach` ignores the returned promise, so the loop finishes instantly, the work races whatever comes next, and a rejection becomes an unhandled promise rather than an error you can catch.

This is precisely how the original `postGroup` responded before its membership inserts had run. Use `for...of` (sequential) or `await Promise.all(items.map(...))` (parallel).
