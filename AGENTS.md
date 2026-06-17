# AGENTS.md

This file provides guidance to agent / engineers when working with code in this repository.

## Python

When running Python, use the venv in the project. Do not use the system environment. Before running Python commands, verify the active interpreter with `which python` and `python --version`.

## Logging

Project-wide logging convention. Two runtimes, two approaches:

- **worker-node (standard Node app):** follow `docs/LOGGING_NODE_JS_V08.md` (authoritative) —
  Winston + `winston-daily-rotate-file`, a singleton logger initialized before any other
  application code, startup validation of required env vars (`NODE_ENV`, `NAME_APP`,
  `PATH_TO_LOGS`), and the dated `{NAME_APP}-YYYY-MM-DD.log` file naming.
- **portal (Next.js app):** `LOGGING_NODE_JS_V08.md` explicitly does **not** apply to
  Next.js. Portal server-side code (route handlers, server actions) uses the shared server
  logger at `portal/src/lib/serverLogger.ts` — level-based, structured, writing to
  stdout/stderr. The portal does **not** use the Winston daily-rotate file transport.

General rules (both apps):

- Do **not** use `console.*` in committed server code — call the logger instead. (The
  console→logger migration described in the logging doc is a human task; agents write
  logger calls directly.)
- Browser/client components should not log in committed code beyond intentional, guarded
  dev diagnostics.
- **Never log secrets** (API keys, tokens, credentials) or full request/response bodies.
  This is an ephemeral demo — log identifiers, counts, statuses, and failure types rather
  than full scraped article content or query payloads.
- Use the app's logger for the server-side detail behind any error response (see Error
  Handling).

## Error Handling

All HTTP/API endpoints return a consistent error envelope, per `docs/ERROR_REQUIREMENTS.md`
(authoritative). This covers **both** worker-node Express routes **and** portal Next.js
route handlers.

- Error response body shape:

  ```json
  { "error": { "code": "UPPER_SNAKE_CODE", "message": "User-facing message", "details": "optional", "status": 500 } }
  ```

- `code` is an UPPER_SNAKE machine-readable identifier; `message` is concise and
  user-facing; `status` matches the HTTP status header.
- `details` is included only in development (`NODE_ENV === "development"`). **Never** expose
  stack traces, DB errors, file paths, internal details, or credentials in production
  responses.
- Prefer the common codes from the doc (`VALIDATION_ERROR` 400, `NOT_FOUND` 404,
  `RATE_LIMIT_EXCEEDED` 429, `INTERNAL_ERROR` 500, `SERVICE_UNAVAILABLE` 503, …).
- Log the detailed error server-side via the logger; return only the sanitized envelope to
  clients.
- Each app should expose a **shared error helper** so routes build the envelope consistently
  rather than hand-rolling it per endpoint.
- Endpoints written before this standard (e.g. the Search route's `{ success, errorCode }`
  shape) are to be migrated to this envelope as part of the dedicated logging/errors cycle.

## Creating Markdown Files in docs/

### Filenames

The default naming pattern should be

- prefix date using the `YYYYMMDD_` format
- descriptive name in lowercase
- use "\_" in place of spaces

### YAML frontmatter

Every generated `.md` file will begin with a YAML frontmatter block delimited by `---` lines containing exactly these four keys:

```yaml
---
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
created_by: <agent name> (<model>)
modified_by: <agent name> (<model>)
---
```

Rules:

- `created_at` is set once, at file creation, and MUST NEVER be modified on later edits.
- `updated_at` is rewritten to today's date on every modification.
- `created_by` is set once, at file creation, and MUST NEVER be modified on later edits.
- `modified_by` is rewritten on every modification. On the very first write, set it to the same value as `created_by`.
- The `created_by` / `modified_by` value uses the format `<agent name> (<model>)`, lowercase only, with no email addresses and no angle brackets.

Acceptable examples:

```yaml
created_by: claude (sonnet-4)
created_by: claude (opus-4.7)
created_by: codex (gpt-5)
modified_by: claude (haiku-4.5)
```

## Commit Message Guidance

### Guidelines

- Only generate the message for staged files/changes
- Title is lowercase, no period at the end.
- Title should be a clear summary, max 50 characters.
- Use the body to explain _why_ and the main areas changed, not just _what_.
- Bullet points should be concise and high-level.
- Try to use the ideal format. But if the commit is too broad or has too many different types, then use the borad format.
- When committing changes from TODO or task list that is already part of the repo and has phases, make refernce to the file and phase instead of writing a long commit message.
- Add a commit body whenever the staged change is not trivially small.
- A body is expected when the commit:
  - touches more than 3 files
  - touches more than one package or app
  - includes both implementation and tests
  - adds a new route, component, workflow, or integration point
- For broader commits, the title can stay concise, but the body should summarize the main change areas so a reader can understand scope without opening the diff.
- Do not use the body as a file inventory. Summarize the logical changes in 2-5 bullets.
- append co-authored-by line(s) at the end of the commit message
  - format: `co-authored-by: <agent name> (<model>)`
  - examples:
    - `co-authored-by: claude (sonnet-4)`
    - `co-authored-by: codex (gpt-5)`
- never include emails or angle brackets (`< >`)
- use lowercase only
- if multiple agents contributed, add one line per agent (no bullets, just separate lines)

### Format

#### Ideal Format

```
<type>:<space><message title>

<bullet points summarizing what was updated>
```

#### Broad Format

```
<message title>

<bullet points summarizing what was updated>
```

#### Types for Ideal Format

| Type     | Description                           |
| -------- | ------------------------------------- |
| feat     | New feature                           |
| fix      | Bug fix                               |
| chore    | Maintenance (e.g., tooling, deps)     |
| docs     | Documentation changes                 |
| refactor | Code restructure (no behavior change) |
| test     | Adding or refactoring tests           |
| style    | Code formatting (no logic change)     |
| perf     | Performance improvements              |
