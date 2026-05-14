# AGENTS.md

## Thread Policy

- Use `caveman` in `full` mode by default for every reply in this repo thread.
- Apply `karpathy-guidelines` continuously to all coding, review, and refactor work.
- Keep both active until the user explicitly asks for a different style or workflow.

## Bootstrap Commands

- Treat a user prompt that begins with `::gacp` as the bootstrap command for the existing `gacp` flow.
- `gacp` means `git add`, `git commit`, and `git push` with the remote, full-confirm bypass path.
- Treat a user prompt that begins with `::cFetch` as the bootstrap command for the working collection fetch flow.
- `cFetch` means refresh the local mgmt collection logs using only the fetches that still succeed.

## Memory Harness

- Keep `mgmt/logs/featureList.md` current when implemented behavior changes materially.
- Append a dated, high-signal entry to `mgmt/logs/actionLog.md` after each meaningful development session.

## Restricted Dirs

- Do not use `${MGMT_DIR}\errFix\` or `${MGMT_DIR}\DL\` for this project.

## Directory Scan

- Auto-scan for new directories and apply the `README.md` rule as soon as a new directory is detected.

## DevArc Management

- Define a `devArc` as any user prompt that begins with `developing <target(s)>`.
- A devArc stays active until the user sends a prompt that begins with `success`.
- On devArc initialization, create a `.txt` file under `C:\chinLog\mgmt\devSessions\YYMMDD\` where `YYMMDD` is the current date.
- Name the file by ordinal within that date folder: `1.txt`, `2.txt`, and so on.
- The file front matter must summarize the functionality being developed and stay updated as the request evolves.
- The file body must use hierarchical, indented step numbering for successive prompts, and each step may contain arbitrarily nested substeps for applied-code-edit specifics.
- Allow user edits inside the file to add `refine`, `debug`, and similar directives that target a specific substep at any nesting depth.

## Code Authoring Specs

- Use vanilla JavaScript unless the user asks for another language.
- Keep modules focused and small; prefer leaf modules over monoliths.
- Follow the Context Object Pattern for authored functions:
  - `@param {{ data?: object, ui?: object, deps: object }} ctx`
  - `const { data = {}, ui = {}, deps } = ctx`
- Route side effects through `ctx.deps` only.
- Avoid new abstractions, config, or flexibility that the task did not ask for.
- Touch only the files and lines needed for the request.
- Do not refactor unrelated code, comments, or formatting.
- Keep project source under `src/`; keep management assets under `mgmt/`.
- Preserve existing module organization across `backend`, `frontend`, and `public`.
- Keep `package.json` as the root command entrypoint when nested package scripts need forwarding.

## Project Refactor Bootstrap

- Scope refactors by current working directory.
- If working inside this repo, keep refactor work project-local.
- Keep refactor changes under `src/` unless the user explicitly asks otherwise.
- Preserve the existing `backend`, `frontend`, and `public` layout.
- Prefer small, concern-separated files and nested subdirectories over large modules.
- Reuse and update root forwarding scripts when nested operational entrypoints change.
- Do not introduce `projMap` or global registry machinery here unless explicitly requested.

## Operational Precedence

When instructions overlap, apply them in this order:

1. User prompt and explicit task requirements
2. Context Object Pattern for function signatures and side-effect boundaries
3. Project module organization and code authoring rules
4. Dynamic path rules
5. This `AGENTS.md`
6. Existing repo conventions that do not conflict with the above

## Dynamic Path Rules

- Never hardcode a single project root when context is dynamic.
- Build paths from `USER_ROOT`, `WORKSPACE_ROOT`, `MGMT_DIR`, `SRC_DIR`, `BACKEND_DIR`, `FRONTEND_DIR`, `PUBLIC_DIR`, `GLOBAL_MGMT_DIR`, and `SESSIONS_ROOT`.
- Resolve paths from those variables first, then from explicit absolute paths provided by the user.
- When following `C:\Users\Qub\AGENTS.md`, resolve its referenced files under `C:\Users\Qub\mgmt`, especially the minimal context-object-pattern source.
- If a path is missing, fail with a clear message that includes the resolved absolute path.
- Prefer dynamic path joins over copied literals.

## Minimal Runtime Snippet

```powershell
$USER_ROOT = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$WORKSPACE_ROOT = (Get-Location).Path
$MGMT_DIR = Join-Path $WORKSPACE_ROOT 'mgmt'
$SRC_DIR = Join-Path $WORKSPACE_ROOT 'src'
$BACKEND_DIR = Join-Path $SRC_DIR 'backend'
$FRONTEND_DIR = Join-Path $SRC_DIR 'frontend'
$PUBLIC_DIR = Join-Path $SRC_DIR 'public'
$GLOBAL_MGMT_DIR = Join-Path $USER_ROOT 'mgmt'
$SESSIONS_ROOT = Join-Path $USER_ROOT '.codex\sessions'
```
