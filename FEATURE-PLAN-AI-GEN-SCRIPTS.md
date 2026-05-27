# Feature Plan: AI-Generated Scripts + TriggerCMD Command Registration

## Goal
Add an AI-assisted feature that can:
- Generate a script from a user request.
- Write that script to disk in a user-selected scripts folder.
- Add (or update) a matching command in `commands.json`, including metadata fields used by TriggerCMD.

## 1) Define the End-to-End Flow in the AI Prompt Contract
- Update the command-generator prompt so it must collect:
  - script purpose
  - OS/shell/runtime
  - script filename
  - target script folder
  - command trigger name
  - parameter behavior
  - metadata fields
- Require confirmation before file writes or `commands.json` edits.
- Keep this guidance in prompt text:
  - Ask the user where they want to create their scripts, and suggest `~/.TRIGGERcmdData/userscripts` or `c:\triggercmd-scripts`.

## 2) Add a New Tool Callable by the Model
Create a tool such as `create_triggercmd_script_command`.

- Inputs:
  - `scriptPath`
  - `scriptContent`
  - `scriptType` (`ps1`, `bat`, `sh`, `py`, `js`)
  - `commandsJsonPath`
  - `commandEntry` object:
    - `trigger`
    - `command`
    - `ground`
    - `offCommand`
    - `voice`
    - `voiceReply`
    - `allowParams`
    - `quoteParams`
    - `mcpToolDescription`
    - `icon`

- Behavior:
  - Validate and normalize paths.
  - Create script directory if missing.
  - Write script file (with optional backup if file exists).
  - Load/parse `commands.json`.
  - Append or upsert command by `trigger`.
  - Preserve unknown keys.
  - Write formatted JSON back.
  - Return structured result (written paths, upsert/append action, backups, summary).

## 3) Add Robust JSON + Schema Validation
- Accept mixed legacy types already found in `commands.json`:
  - booleans as `"true"/"false"` and `true/false`.
- Normalize booleans on write (choose one consistent convention).
- Enforce required minimum fields:
  - `trigger`, `command`, `ground`.
- Prevent accidental duplicate `trigger` collisions unless user confirms overwrite/upsert.

## 4) Implement Safe Command String Generation
- Build `command` with OS-appropriate quoting/escaping.
- Include parameter passthrough patterns when `allowParams` is true:
  - `.bat/.cmd`: `%*`
  - PowerShell: `$args` (or explicit `param(...)`)
  - Bash: `"$@"`
- Generate templates that are safe/idempotent where practical.

## 5) Add Metadata Defaults and Mapping Rules
- Defaults:
  - `offCommand: ""`
  - `voice: ""`
  - `voiceReply: ""`
  - `allowParams: "false"` (or normalized boolean convention)
  - `mcpToolDescription: ""`
- Include optional fields only when meaningful:
  - `icon`, `quoteParams`, etc.
- Keep output compatible with existing file style and legacy entries.

## 6) Wire Tool into the Existing AI Chat Loop
- Register the new tool in both OpenAI and Anthropic tool schemas.
- Extend tool dispatch to execute script write + `commands.json` update.
- Reuse chat tool-call/result rendering to show success/failure clearly.

## 7) Add UX Confirmation + Preview Before Write
- Before tool execution, AI should show:
  - script preview
  - final command line
  - exact `commands.json` entry preview
- Require explicit user confirmation (`yes`) before writing files.

## 8) Add Error Handling and Recovery
- Handle:
  - invalid JSON
  - missing file permissions
  - invalid/missing path
  - encoding issues
  - duplicate trigger conflicts
- Create timestamped backup of `commands.json` before write.
- Return actionable errors to guide follow-up questions.

## 9) Add Tests for Core Logic
- Extract write/update logic into a testable module.
- Unit tests:
  - append new entry
  - upsert existing `trigger`
  - preserve unrelated entries/fields
  - boolean normalization
  - path quoting and command generation
- Integration test:
  - temp script + temp `commands.json`
  - run tool
  - verify file outputs

## 10) Document in README
- Describe new capability: generate script + register TriggerCMD command.
- Document confirmation gate and backup behavior.
- Include default example prompt:
  - `Add a command to backup my SD card to my NAS, including de-duplication.`

## 11) Rollout Order
- Phase 1: prompt + tool schema + dry-run preview. ✓
- Phase 2: real writes enabled with explicit confirmation + backup.
- Phase 3: quality improvements (script templates by type, conflict resolution UX, richer metadata suggestions).
- Phase 4: TRIGGERcmd subscription provider support (see section 12).

## 12) TRIGGERcmd Subscription Provider Support

The `triggercmd` provider routes chat through the server-side `/api/v1/chat/message` endpoint, which controls its own system prompt. Changes to `AI_SYSTEM_PROMPT` in the client have no effect for this provider. Script generation and tool use must be wired through the server API to work for subscription users.

### Problem
- `runTriggercmdLoop` is a single-round-trip: `message` → `assistantMessage`. No tool use, no system prompt injection.
- The server does not accept tool definitions or a client-supplied system prompt.

### Solution — two-part change

**Part A: Update the server API**
- Accept an optional `tools` array in the request body (OpenAI-compatible function schemas).
- Accept an optional `systemPromptAddendum` string appended to the server's base system prompt.
- When the model returns a `tool_use` / `tool_calls` block, return it to the client in the response (e.g., `toolCalls: [...]`) instead of resolving it server-side.
- Keep backwards compatibility: if `tools` is omitted, behavior is unchanged.

**Part B: Update `runTriggercmdLoop` in `src/App.jsx`**
- Pass `tools: AI_TOOLS_OPENAI` (or Anthropic format, depending on what the server model uses) in the request body.
- Pass `systemPromptAddendum` containing the script-generation section of `AI_SYSTEM_PROMPT`.
- Loop: if the response contains `toolCalls`, execute them locally via `executeTool`, then POST the results back to the same `conversationId` and continue until a plain text response is returned.
- Show tool call / tool result messages in the chat UI the same way the OpenAI and Anthropic loops do.

### Checklist

**Server (`/api/v1/chat/message`)** — see [FEATURE-PLAN-SERVER-TOOL-USE.md](FEATURE-PLAN-SERVER-TOOL-USE.md) for the full server-side plan.
- [ ] Accept optional `tools` array and forward to the underlying model.
- [ ] Accept optional `systemPromptAddendum` and append to base system prompt.
- [ ] Return `toolCalls` array in response when model requests tool use.
- [ ] Accept tool results on a follow-up POST to the same `conversationId`.
- [ ] Keep single-round-trip behavior intact when `tools` is omitted.

**Client (`src/App.jsx` — `runTriggercmdLoop`)**
- [ ] Include `tools` and `systemPromptAddendum` in the POST body.
- [ ] Loop on `toolCalls` response: execute locally, POST results, repeat.
- [ ] Render `tool_call` and `tool_result` chat messages for each tool turn.
- [ ] Surface clear error when the subscription tier does not support tool use.

## Implementation Checklist

### Prompt and UX in `src/App.jsx`
- [x] Keep/extend `AI_SYSTEM_PROMPT` to require script-location question and folder suggestions.
- [x] Add a "preview then confirm" interaction rule in prompt text for write actions.
- [x] Ensure default user prompt remains set via `AI_DEFAULT_COMMAND_GENERATOR_PROMPT`.
- [x] Update empty-state/help copy to mention script generation + command installation.

### Tool Schemas in `src/App.jsx`
- [x] Add `create_triggercmd_script_command` to `AI_TOOLS_OPENAI` (`type: "function"` schema).
- [x] Add `create_triggercmd_script_command` to `AI_TOOLS_ANTHROPIC` (`input_schema`).
- [x] Define strict parameter schema with required fields:
  - `scriptPath`, `scriptContent`, `scriptType`, `commandsJsonPath`, `commandEntry`.

### Tool Execution Wiring in `src/App.jsx`
- [x] Extend `executeTool` dispatcher with `create_triggercmd_script_command` (dry-run for Phase 1).
- [ ] Add validation and normalization helpers for:
  - file paths
  - command entry defaults
  - trigger collision strategy
- [x] Return structured JSON results usable by chat bubbles.

### File I/O Implementation (new module)
- [ ] Create `src/lib/triggercmdScriptInstaller.js` for pure logic.
- [ ] Implement:
  - `ensureDirForFile(path)`
  - `backupIfExists(path)`
  - `writeScriptFile(path, content)`
  - `readCommandsJson(path)`
  - `upsertCommandEntry(commands, entry, mode)`
  - `writeCommandsJson(path, commands)`
- [ ] Keep unknown metadata keys intact when updating existing entries.

### Command + Template Helpers (new module or section)
- [ ] Add script template helpers by `scriptType`:
  - `ps1`, `bat`, `sh`, `py`, `js`
- [ ] Add command-string generator:
  - Windows quoting for `c:\...` paths
  - Linux/macOS quoting for POSIX paths
  - optional param passthrough

### Safety and Recovery
- [ ] Backup `commands.json` before modification:
  - `commands.json.bak.<timestamp>`
- [ ] Add clear errors for invalid JSON and permission issues.
- [ ] Require explicit user confirmation step before actual write.

### Tests
- [ ] Add unit tests for update logic and normalization.
- [ ] Add integration test for write + JSON update flow.
- [ ] Add at least one test for duplicate trigger handling with and without overwrite confirmation.

### Docs
- [ ] Update `README.md` with:
  - feature overview
  - required confirmation behavior
  - backup strategy
  - example prompts
  - expected `commands.json` entry shape
