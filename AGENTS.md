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

## Source Layout

- Prefer vanilla `.js` unless user asks otherwise.
- Keep modules focused and small.
- Apply Context Object Pattern for authored JS functions:
  - `@param {{ data?: object, ui?: object, deps: object }} ctx`
  - `const { data = {}, ui = {}, deps } = ctx`
- Route side effects through `ctx.deps`.

## Project Bootstrap

Keep these files under `${MGMT_DIR}\projMap\`:

- `threads\README.md`
- `threads\resolve-init-thread.ps1`
- `threads\current-thread.json`
- `state\thread-map-deltas.json`
- `modules\thread-map-tracker\index.js`
- `modules\thread-map-tracker\tracker.js`
- `modules\thread-map-tracker\delta.js`
- `modules\thread-map-tracker\io.js`
- `scripts\generate-map.ps1`
- `scripts\track-map-update.js`

## Map And Thread State

- Do not maintain `${PROJMAP_DIR}\map.json` for this project.
- Keep runtime thread cache in `${PROJMAP_DIR}\threads\`.
- Keep map delta history in `${PROJMAP_DIR}\state\`.

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
