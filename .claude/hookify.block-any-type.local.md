---
name: block-any-type
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: ':\s*any\b|<any[>,\s]|\bas\s+any\b|\[\]\s*:\s*any'
---

**`any` is forbidden — spec Decision 8, hard project rule.**

Every external boundary here (LLM responses, Sequelize results, socket payloads, `req.body`, `process.env`) is exactly the loosely-shaped data that tempts an `any`. That is where type safety earns its keep, not where it is safe to relax.

Instead: define a real interface, validate with zod at the I/O boundary, or narrow `unknown` with a type guard. If a library's own types are incomplete, write a local interface for the subset you use — see `ByteStream` in `packages/llm/src/providers/ollama.ts`.
