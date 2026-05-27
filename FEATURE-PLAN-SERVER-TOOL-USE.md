# Server Plan: Client-Delegated Tool Use for `/api/v1/chat/message`

Companion to `FEATURE-PLAN-AI-GEN-SCRIPTS.md` — Phase 4.

## Goal

Allow the Mission Control client to pass tool definitions to the chat endpoint and receive tool-call requests back, so that tools involving local file I/O (e.g. `create_triggercmd_script_command`) can be executed on the user's machine rather than on the server.

## Background

The current `/api/v1/chat/message` endpoint is a single-round-trip:  
`POST { message, conversationId? }` → `{ assistantMessage, conversationId }`

The server picks the model, sets the system prompt, and resolves everything internally. The client has no way to inject tools or handle tool calls. Script generation requires executing tools client-side (writing files to the user's disk), so the server must be extended to surface tool-call requests back to the client and accept tool results on a follow-up turn.

## Request / Response Contract Changes

### POST `/api/v1/chat/message`

**New optional request fields:**

```jsonc
{
  "message": "Add a command to backup my SD card...",
  "conversationId": "abc123",           // existing field
  "tools": [ /* OpenAI function-tool schema array */ ],
  "toolResults": [                       // present only on a tool-result turn
    {
      "toolCallId": "call_xyz",
      "result": "{ \"dryRun\": true, ... }"
    }
  ],
  "systemPromptAddendum": "..."          // appended to the server base prompt
}
```

- `tools` — OpenAI-compatible `{ type: "function", function: { name, description, parameters } }` array. Forwarded verbatim to the model.
- `toolResults` — array of results the client executed for tool calls returned in the previous response. When present, `message` should be omitted (or ignored).
- `systemPromptAddendum` — plain text appended after the server's base system prompt with a blank line separator. Allows the client to inject feature-specific guidance without replacing the server prompt entirely.

**New optional response fields:**

```jsonc
{
  "assistantMessage": null,              // null when toolCalls is present
  "conversationId": "abc123",
  "toolCalls": [                         // present when model requests tool use
    {
      "toolCallId": "call_xyz",
      "name": "create_triggercmd_script_command",
      "arguments": { /* parsed JSON */ }
    }
  ]
}
```

- Exactly one of `assistantMessage` or `toolCalls` is non-null per response.
- When `toolCalls` is returned the client executes each tool, then POSTs a follow-up request with `toolResults` and the same `conversationId`.

## Server Implementation Steps

### 1) Route / controller changes

- Parse and validate the new optional fields (`tools`, `toolResults`, `systemPromptAddendum`).
- If `tools` is absent, the request is a standard single-round-trip — existing behavior unchanged.
- Append `systemPromptAddendum` to the base system prompt when present.

### 2) Conversation state

- Store tool-call turns in the conversation history alongside user and assistant turns so the model has full context on follow-up POSTs.
- On a `toolResults` POST: reconstruct the conversation, append the tool results as the appropriate role (e.g. `tool` for OpenAI, or `user` content blocks with `tool_result` type for Anthropic), and call the model again.
- Continue until the model returns a text response with no tool calls.

### 3) Model forwarding

- Forward `tools` to the underlying model API in the correct format (OpenAI `tools` array or Anthropic `tools` array, depending on which model the subscription uses).
- Map model tool-call responses back to the unified `toolCalls` array in the response.
- If the model does not support tool use, return a `400` with `{ error: "Tool use not supported for this subscription tier" }`.

### 4) Security

- Whitelist permitted tool names server-side. Reject any tool name not in the allowed set.
  - Initial allowed set: `list_commands`, `run_command`, `create_triggercmd_script_command`.
- Validate `tools` schemas before forwarding — reject unknown top-level keys.
- Rate-limit tool-result POSTs per conversation to prevent runaway loops (e.g. max 10 tool turns per conversation).

### 5) Backwards compatibility

- If `tools` is omitted the endpoint behaves exactly as today — no breaking change.
- Clients that do not send `tools` continue to receive `{ assistantMessage, conversationId }` with no new fields.

## Checklist

### Route / parsing
- [ ] Parse `tools`, `toolResults`, `systemPromptAddendum` from request body.
- [ ] Validate `tools` array structure; reject malformed schemas with `400`.
- [ ] Whitelist tool names; reject unknown names with `400`.

### Conversation state
- [ ] Persist tool-call turns (assistant tool-call message + tool result message) in conversation history.
- [ ] Reconstruct full history on `toolResults` follow-up POST.
- [ ] Enforce max tool-turn limit per conversation (suggest 10).

### Model forwarding
- [ ] Append `systemPromptAddendum` to base system prompt when present.
- [ ] Forward `tools` in the correct format for the active model provider (OpenAI / Anthropic).
- [ ] Map model tool-call response to unified `toolCalls` response field.
- [ ] Return `assistantMessage: null` when `toolCalls` is present.

### Error handling
- [ ] Return `{ error: "Tool use not supported for this subscription tier" }` with `400` when model does not support tools.
- [ ] Return clear error when max tool turns exceeded.
- [ ] Do not expose internal model errors in the `toolCalls` response.

### Tests
- [ ] Single-round-trip with no `tools` field — existing behavior unchanged.
- [ ] One tool-call turn: model requests tool → client result → model returns text.
- [ ] Multiple tool-call turns in sequence.
- [ ] Unknown tool name rejected.
- [ ] Max turn limit enforced.
- [ ] `systemPromptAddendum` appears in reconstructed prompt sent to model.
