// Pure logic for normalizing TriggerCMD command entries and generating command strings.
// No file I/O — all writes go through Electron IPC in executeTool.

const PARAM_PASSTHROUGH = { ps1: "$args", bat: "%*", sh: '"$@"', py: "", js: "" };

export function generateCommandString(scriptPath, scriptType, platform, allowParams) {
  const type = scriptType?.toLowerCase();
  const passthrough = allowParams ? ` ${PARAM_PASSTHROUGH[type] || ""}`.trimEnd() : "";

  if (type === "ps1") {
    return platform === "win32"
      ? `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"${passthrough}`
      : `pwsh -ExecutionPolicy Bypass -File "${scriptPath}"${passthrough}`;
  }
  if (type === "bat") return `"${scriptPath}"${passthrough}`;
  if (type === "sh")  return `bash "${scriptPath}"${passthrough}`;
  if (type === "py")  return `python "${scriptPath}"${passthrough}`;
  if (type === "js")  return `node "${scriptPath}"${passthrough}`;
  return `"${scriptPath}"${passthrough}`;
}

const VALID_GROUND_VALUES = ["foreground", "background"];

export function normalizeCommandEntry(entry) {
  const ground = VALID_GROUND_VALUES.includes(entry.ground) ? entry.ground : "foreground";
  return {
    trigger:            entry.trigger            ?? "",
    command:            entry.command            ?? "",
    ground,
    offCommand:         entry.offCommand         ?? "",
    voice:              entry.voice              ?? "",
    voiceReply:         entry.voiceReply         ?? "",
    allowParams:        entry.allowParams        ?? "false",
    quoteParams:        entry.quoteParams        ?? "false",
    mcpToolDescription: entry.mcpToolDescription ?? "",
    ...(entry.icon ? { icon: entry.icon } : {}),
  };
}

export function upsertCommandEntry(commands, entry) {
  const idx = commands.findIndex(c => c.trigger === entry.trigger);
  if (idx >= 0) {
    commands[idx] = { ...commands[idx], ...entry };
    return { commands, action: "updated" };
  }
  commands.push(entry);
  return { commands, action: "added" };
}
