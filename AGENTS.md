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

## Dev Tunnel

- Development uses Cloudflare free quick tunnels through `cloudflared`.
- Use `cloudflared tunnel --url http://localhost:PORT` to expose the local dev server.
- Assume `cloudflared` is on `PATH`, or pass an explicit binary path in module data.
- Put tunnel orchestration in `src/backend/dev-tunnel/`.
- Module must capture and surface the dynamic `trycloudflare.com` URL.
- Keep tunnel logic dev-only. No production tunnel config for this project.
- When server runs, launch tunnel automatically from local URL without extra user step.

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
