# AGENTS.md

## Scope And Paths

Use dynamic roots. Keep portable.

- `USER_ROOT`: user home directory
- `WORKSPACE_ROOT`: current project root
- `MGMT_DIR`: `${WORKSPACE_ROOT}\mgmt`
- `PROJMAP_DIR`: `${MGMT_DIR}\projMap`
- `SRC_DIR`: `${WORKSPACE_ROOT}\src`
- `BACKEND_DIR`: `${SRC_DIR}\backend`
- `FRONTEND_DIR`: `${SRC_DIR}\frontend`
- `PUBLIC_DIR`: `${SRC_DIR}\public`
- `GLOBAL_MGMT_DIR`: `${USER_ROOT}\mgmt`
- `SESSIONS_ROOT`: `${USER_ROOT}\.codex\sessions`

Resolve paths from these variables first.

## Default Style

- Use `caveman` `full` unless user asks otherwise.
- Keep `karpathy-guidelines`: simple, surgical, verified.

## Machine Gate

Before changes, verify setup:

- `${GLOBAL_MGMT_DIR}\scripts\ensure-machine-setup.ps1`

If setup flag bad, run setup before continue.

## Project Init Rules

- Keep project files under `${SRC_DIR}` unless file belongs in `${MGMT_DIR}` or root `AGENTS.md`.
- Create and keep `${WORKSPACE_ROOT}\.gitignore`.
- Do not use `${MGMT_DIR}\toDo\`, `${MGMT_DIR}\errFix\`, or `${MGMT_DIR}\logs\` for this project.
- All dirs will contain a top-level `README.md`.

## Source Layout

- Prefer vanilla `.js` unless user asks otherwise.
- Use hierarchical modular folders with clear separation of concerns.
- Use aggregator files for composition and import/export boundaries.
- Keep modules focused and small.
- Apply Context Object Pattern for authored JS functions:
  - every function accepts one `ctx` argument
  - `ctx.data` for runtime inputs and config
  - `ctx.ui` for optional UI refs
  - `ctx.deps` for injected capabilities and all side effects
  - `@param {{ data?: object, ui?: object, deps: object }} ctx`
  - `const { data = {}, ui = {}, deps } = ctx`
- Read inputs only from `ctx.data`.
- Use only `ctx.deps` for side effects and async work.
- If a needed capability is missing in `deps`, state a brief Dep Proposal first.

## Logging Pipeline

- Use the shared logger in `${PUBLIC_DIR}\logger.js` for all new runtime logging.
- Backend code should create or receive a logger via `deps.logger` and emit structured events, states, and errors instead of raw `console.log` calls.
- Browser code should use `createBrowserTransport()` plus a browser logger instance so logs are batched to `POST /api/logs` and echoed in the launching terminal.
- Keep terminal output as the canonical runtime log stream for this app.
- Keep a single run log at `${MGMT_DIR}\logs\current-run.log`; `npm start` clears it at startup and appends the current run as logs stream in.
- Log at the highest useful boundary, then add deeper logs only when they change control flow, mutate state, or throw.
- Do not log raw buffers, request bodies, DOM trees, or injected dependency objects; log safe summaries only.
- Prefer `logCtx(ctx, logger, meta)` or logger boundary helpers when authoring new ctx-based functions.
- If new runtime-visible logging is added, wire it through the existing browser relay and server terminal print path rather than adding a new sink.

## Dev Tunnel

- Development uses Cloudflare free quick tunnels through `cloudflared`.
- Use `cloudflared tunnel --url http://localhost:PORT` to expose the local dev server.
- Use the installed binary path or `PATH`; on this machine the confirmed install is `C:\Program Files (x86)\cloudflared\cloudflared.exe`.
- Put tunnel orchestration in `src/backend/dev-tunnel/`.
- Module must capture and surface only the dynamic `trycloudflare.com` URL in terminal output.
- Do not surface routine `cloudflared` chatter in terminal.
- Keep tunnel logic dev-only. No production tunnel config for this project.
- When server runs, launch tunnel automatically from local URL without extra user step.
- Fix tunnel launch by using the real binary. Do not suppress missing-binary failures with no-op or disabled tunnel code.
- Prefer the documented compatible tunnel transport (`http2`) when it makes launch reliable on this machine. Do not replace it with a no-op fallback.

## Blank Page Server

- Root `package.json` must expose `npm start` for local server and `npm run dev` as an alias for same auto-tunneled server.
- Blank page HTTP server lives in `src/backend/server/`.
- Serve `src/public/index.html` at `/`, `src/frontend/app.js` at `/app.js`, and `src/frontend/style.css` at `/style.css`.
- Keep page blank by default. No app features beyond server boot and tunnel wiring.

## Project Bootstrap

Keep these files under `${MGMT_DIR}\projMap\`:

- `threads\README.md`
- `threads\resolve-init-thread.ps1`
- `threads\current-thread.json`
- `threads\all-threads.json`

## Map And Thread State

- Do not maintain `${PROJMAP_DIR}\map.json` for this project.
- Keep runtime thread cache in `${PROJMAP_DIR}\threads\`.
- Keep current thread in `current-thread.json`.
- Keep all project threads in `all-threads.json`.

## Plain English Project File

- Project intent lives in `${PROJMAP_DIR}\project.txt`.
- That file is the monolithic plain-english project spec for autonomous AI agents.
- The file uses nested hierarchical blocks where nesting means subordinate relationship.
- Front matter lives in multiline fenced code blocks placed above each block body.
- The front matter fence and its contents inherit the indent of the block they annotate.
- Nested block front matter must stay visually aligned with that nested block.
- Each block's front matter must stay inside its own fenced code block.
- Front matter is bottom-up: deepest applicable nesting carries the most detail.
- Superordinate blocks show only the details not already covered by deeper nesting.
- Do not duplicate parent block values in child block front matter.
- Keep child block front matter focused on child-specific detail, UI refs, and deps only.
- AI may edit only front matter in `project.txt`.
- AI must never touch non-front matter content in `project.txt`.
- Developer owns all non-front matter content and keeps it authoritative.
- Front matter shape will be defined in future prompts and must be followed exactly once provided.
- Front matter may contain implementation specifics for generated code, including data, UI selectors, styling params, and deps for that block.
- `data` in front matter is not style data. It refers to backend data collections for the block under `${WORKSPACE_ROOT}\src\backend` as SQL-like `.json` stores associated with the block.
- Leave `data` blank until those backend collections are actually implemented. Once implemented, include the actual collection path and schema properties needed by the block.
- Apply data hiding to front matter: keep internal implementation details contained there, expose only the minimal safe behavior to the rest of the file.
- Do not leak block internals into non-front matter content.

## Thread Context

- When current Codex thread context usage reaches 90%, compact context immediately before continuing work.
- Compact by preserving active project rules, current task state, latest file changes, and unresolved decisions.
- Drop stale exploration detail, duplicate logs, and completed intermediate checks first.

## `.gitignore`

- Ignore generated state and common junk.
- Keep source and governed mgmt files tracked.

## Dynamic Path Rules

- Never hardcode a different workspace root.
- If a path is missing, fail with the resolved absolute path.

## Minimal Path Snippet

```powershell
$USER_ROOT = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$WORKSPACE_ROOT = (Get-Location).Path
$MGMT_DIR = Join-Path $WORKSPACE_ROOT 'mgmt'
$PROJMAP_DIR = Join-Path $MGMT_DIR 'projMap'
$SRC_DIR = Join-Path $WORKSPACE_ROOT 'src'
$BACKEND_DIR = Join-Path $SRC_DIR 'backend'
$FRONTEND_DIR = Join-Path $SRC_DIR 'frontend'
$PUBLIC_DIR = Join-Path $SRC_DIR 'public'
$GLOBAL_MGMT_DIR = Join-Path $USER_ROOT 'mgmt'
$SESSIONS_ROOT = Join-Path $USER_ROOT '.codex\sessions'
```
