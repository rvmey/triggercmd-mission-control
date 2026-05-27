import { useState, useEffect, useRef } from "react";
import iconUrl from "./assets/icon.png";
import { version } from "../package.json";
import { generateCommandString, normalizeCommandEntry, upsertCommandEntry } from "./lib/triggercmdScriptInstaller.js";

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "");

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

// ── TRIGGERcmd API ────────────────────────────────────────────────────────
// Use full URL when running in Electron (file:// protocol); Vite proxy handles /api in the browser
const API_BASE = (window.electronEnv?.isElectron || window.location.protocol === 'file:')
  ? 'https://www.triggercmd.com'
  : '';

async function fetchCommands(token) {
  const res = await fetch(`${API_BASE}/api/command/list`, {
    headers: { "Authorization": `Bearer ${token}`, "Cache-Control": "no-cache" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  const data = JSON.parse(text);
  return data.records || data;
}

async function triggerCommand(token, computer, command, params) {
  const body = { computer, command, sender: "TRIGGERcmd Mission Control" };
  if (params) body.params = params;

  const res = await fetch(`${API_BASE}/api/run/trigger`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function fetchPanelButtons(token) {
  const authHeaders = { "Authorization": `Bearer ${token}`, "Cache-Control": "no-cache" };
  let res = await fetch(`${API_BASE}/api/panelbutton/list`, { headers: authHeaders });

  // Some deployments only accept token query auth for panel endpoints.
  if (!res.ok) {
    res = await fetch(`${API_BASE}/api/panelbutton/list?token=${encodeURIComponent(token)}`, {
      headers: { "Cache-Control": "no-cache" },
    });
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.records || data || [];
}

async function triggerPanelButton(token, panel, button, params) {
  const qs = new URLSearchParams({ panel, button });
  if (params) qs.set("params", params);

  let res = await fetch(`${API_BASE}/api/panel/trigger?${qs.toString()}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });

  if (!res.ok) {
    const fallbackQs = new URLSearchParams({ token, panel, button });
    if (params) fallbackQs.set("params", params);
    res = await fetch(`${API_BASE}/api/panel/trigger?${fallbackQs.toString()}`);
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return await res.text();
}

function normalizePanels(records) {
  const grouped = {};
  records.forEach((record, idx) => {
    const panelName = record.panel?.name || record.panelName || "Uncategorized";
    const buttonName = record.name || record.buttonName || `Button ${idx + 1}`;
    const useRegex = Boolean(record.useregex ?? record.useRegex);
    const options = String(record.params || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const id = String(record.id || `${panelName}::${buttonName}::${idx}`);
    (grouped[panelName] = grouped[panelName] || []).push({
      id,
      panelName,
      buttonName,
      useRegex,
      paramOptions: options,
    });
  });
  return grouped;
}

// ── Styles (injected once) ─────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

.tc-root {
  --bg: #040a0f;
  --surface: #080f18;
  --panel: #0b1622;
  --border: #0e2a40;
  --accent: #00d4ff;
  --accent2: #00ff9d;
  --accent3: #ff6b35;
  --warn: #ffd700;
  --danger: #ff3366;
  --text: #c8dcea;
  --muted: #4a6a82;

  background: var(--bg);
  color: var(--text);
  font-family: 'IBM Plex Sans', sans-serif;
  font-weight: 300;
  min-height: 100vh;
  padding: 20px;
  position: relative;
  overflow-x: hidden;
}

.tc-root * { box-sizing: border-box; margin: 0; padding: 0; }

/* grid bg */
.tc-root::before {
  content:''; position:fixed; inset:0; pointer-events:none;
  background-image: linear-gradient(rgba(0,212,255,.03) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,212,255,.03) 1px,transparent 1px);
  background-size:40px 40px; z-index:0;
}

/* scanlines */
.tc-root::after {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:100;
  background: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.12) 2px,rgba(0,0,0,.12) 4px);
}

.tc-inner { position:relative; z-index:1; max-width:100%; margin:0 auto; }

/* header */
.tc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; padding-bottom:18px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:12px; }
.tc-logo { display:flex; align-items:center; gap:14px; }
.tc-logo-icon { width:44px; height:44px; border:2px solid var(--accent); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 0 20px rgba(0,212,255,.3),inset 0 0 20px rgba(0,212,255,.1); animation:tcPulse 3s ease-in-out infinite; }
@keyframes tcPulse { 0%,100%{box-shadow:0 0 20px rgba(0,212,255,.3),inset 0 0 20px rgba(0,212,255,.1)} 50%{box-shadow:0 0 40px rgba(0,212,255,.6),inset 0 0 30px rgba(0,212,255,.2)} }
.tc-logo h1 { font-family:'Orbitron',monospace; font-size:17px; font-weight:900; letter-spacing:3px; color:var(--accent); text-shadow:0 0 20px rgba(0,212,255,.5); }
.tc-logo span { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:2px; display:block; margin-top:2px; }

.tc-status { display:flex; align-items:center; gap:8px; font-family:'Share Tech Mono',monospace; font-size:12px; color:var(--muted); }
.tc-dot { width:8px; height:8px; border-radius:50%; background:var(--muted); }
.tc-dot.on { background:var(--accent2); box-shadow:0 0 8px var(--accent2); animation:tcBlink 2s ease-in-out infinite; }
@keyframes tcBlink { 0%,100%{opacity:1} 50%{opacity:.4} }

/* token setup */
.tc-setup { background:var(--panel); border:1px solid var(--border); border-top:2px solid var(--accent); border-radius:12px; padding:40px; text-align:center; max-width:520px; margin:60px auto; box-shadow:0 0 20px rgba(0,212,255,.3); }
.tc-setup h2 { font-family:'Orbitron',monospace; font-size:15px; color:var(--accent); letter-spacing:2px; margin-bottom:12px; }
.tc-setup p { color:var(--muted); font-size:13px; line-height:1.7; margin-bottom:24px; }
.tc-setup a { color:var(--accent); text-decoration:none; }
.tc-input-row { display:flex; gap:10px; }
.tc-input { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px 16px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:13px; outline:none; transition:border-color .2s,box-shadow .2s; }
.tc-input:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(0,212,255,.15); }
.tc-note { margin-top:14px; font-size:11px; color:var(--muted); font-family:'Share Tech Mono',monospace; }

/* buttons */
.btn { font-family:'Orbitron',monospace; font-size:11px; letter-spacing:1.5px; font-weight:700; padding:12px 20px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
.btn:disabled { opacity:.5; cursor:not-allowed; transform:none !important; }
.btn-cyan { background:var(--accent); color:var(--bg); box-shadow:0 0 15px rgba(0,212,255,.3); }
.btn-cyan:hover:not(:disabled) { background:#33ddff; box-shadow:0 0 25px rgba(0,212,255,.6); transform:translateY(-1px); }
.btn-green { background:var(--accent2); color:var(--bg); box-shadow:0 0 12px rgba(0,255,157,.3); font-size:10px; padding:8px 16px; border-radius:6px; }
.btn-green:hover:not(:disabled) { box-shadow:0 0 22px rgba(0,255,157,.6); transform:translateY(-1px); }
.btn-ghost { background:transparent; color:var(--muted); border:1px solid var(--border); }
.btn-ghost:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }

/* stats */
.tc-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:24px; }
.stat { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:18px 22px; position:relative; overflow:hidden; }
.stat::before { content:''; position:absolute; top:0;left:0;right:0;height:2px; }
.stat.blue::before { background:var(--accent); }
.stat.green::before { background:var(--accent2); }
.stat.orange::before { background:var(--accent3); }
.stat-label { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; color:var(--muted); margin-bottom:6px; }
.stat-val { font-family:'Orbitron',monospace; font-size:30px; font-weight:900; line-height:1; }
.stat.blue .stat-val { color:var(--accent); }
.stat.green .stat-val { color:var(--accent2); }
.stat.orange .stat-val { color:var(--accent3); }

/* layout */
.tc-grid { display:grid; grid-template-columns:220px 1fr; gap:18px; }

/* sidebar */
.tc-sidebar { display:flex; flex-direction:column; gap:6px; max-height:calc(100vh - 260px); overflow-y:auto; }
.tc-sidebar::-webkit-scrollbar { width:12px; }
.tc-sidebar::-webkit-scrollbar-track { background:var(--surface); border-radius:6px; }
.tc-sidebar::-webkit-scrollbar-thumb { background:var(--muted); border-radius:6px; border:2px solid var(--surface); }
.tc-sidebar::-webkit-scrollbar-thumb:hover { background:var(--accent); }
.sidebar-lbl { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:2px; color:var(--muted); padding:0 4px; margin-bottom:4px; }
.comp-btn { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:13px 14px; cursor:pointer; transition:all .2s; text-align:left; width:100%; display:flex; align-items:center; gap:10px; }
.comp-btn:hover { border-color:var(--accent); background:rgba(0,212,255,.05); }
.comp-btn.active { border-color:var(--accent); background:rgba(0,212,255,.08); box-shadow:0 0 18px rgba(0,212,255,.2); }
.comp-name { font-family:'Share Tech Mono',monospace; font-size:12px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.comp-count { font-size:11px; color:var(--muted); margin-top:2px; }

/* commands panel */
.tc-panel { background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
.panel-hdr { padding:16px 22px; border-bottom:1px solid var(--border); background:var(--surface); display:flex; align-items:center; justify-content:space-between; }
.panel-title { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; color:var(--accent); letter-spacing:2px; }
.panel-sub { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--muted); margin-top:3px; }
.search { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 12px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:12px; outline:none; width:180px; transition:all .2s; }
.search:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(0,212,255,.1); }

.cmds-list { overflow-x:auto; overflow-y:hidden; padding:10px; display:flex; flex-direction:column; flex-wrap:wrap; gap:10px; max-height:calc(100vh - 260px); align-content:flex-start; }
.cmds-list::-webkit-scrollbar { height:12px; }
.cmds-list::-webkit-scrollbar-track { background:var(--surface); border-radius:6px; }
.cmds-list::-webkit-scrollbar-thumb { background:var(--muted); border-radius:6px; border:2px solid var(--surface); }
.cmds-list::-webkit-scrollbar-thumb:hover { background:var(--accent); }

.cmd-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:13px 15px; display:flex; align-items:flex-start; gap:12px; transition:all .2s; animation:tcSlide .12s ease both; width:340px; flex-shrink:0; }
@keyframes tcSlide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
.cmd-card:hover { border-color:rgba(0,212,255,.3); background:rgba(0,212,255,.03); }
.cmd-card.running { border-color:var(--warn); background:rgba(255,215,0,.05); animation:tcRunning 1s ease-in-out infinite; }
@keyframes tcRunning { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 15px rgba(255,215,0,.2)} }
.cmd-card.success { border-color:var(--accent2); background:rgba(0,255,157,.05); }
.cmd-card.error { border-color:var(--danger); background:rgba(255,51,102,.05); }

.cmd-icon-box { width:34px; height:34px; border-radius:7px; border:1px solid var(--border); background:var(--panel); display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; margin-top:1px; }
.cmd-body { flex:1; min-width:0; }
.cmd-name { font-family:'Share Tech Mono',monospace; font-size:13px; color:var(--text); }
.cmd-desc { font-size:11px; color:var(--muted); margin-top:3px; }
.cmd-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.badge-params { font-family:'Share Tech Mono',monospace; font-size:10px; padding:3px 7px; border-radius:4px; background:rgba(255,107,53,.15); color:var(--accent3); border:1px solid rgba(255,107,53,.3); }
.cmd-status-text { font-family:'Share Tech Mono',monospace; font-size:11px; }
.cmd-status-text.running { color:var(--warn); }
.cmd-status-text.success { color:var(--accent2); }
.cmd-status-text.error { color:var(--danger); }

.params-row { display:flex; align-items:center; gap:7px; margin-top:9px; padding-top:9px; border-top:1px solid var(--border); flex-wrap:wrap; }
.params-input { flex:1; min-width:0; background:var(--panel); border:1px solid var(--border); border-radius:6px; padding:7px 11px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:12px; outline:none; transition:border-color .2s; }
.params-input:focus { border-color:var(--accent); }

/* log */
.tc-log { margin-top:18px; background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
.log-hdr { padding:13px 20px; border-bottom:1px solid var(--border); background:var(--surface); font-family:'Orbitron',monospace; font-size:11px; color:var(--muted); letter-spacing:2px; }
.log-body { padding:10px 18px; font-family:'Share Tech Mono',monospace; font-size:12px; max-height:130px; overflow-y:auto; display:flex; flex-direction:column-reverse; gap:3px; }
.log-entry { display:flex; gap:12px; opacity:.8; animation:tcFade .3s ease; }
@keyframes tcFade { from{opacity:0;transform:translateY(3px)} to{opacity:.8;transform:translateY(0)} }
.log-time { color:var(--muted); flex-shrink:0; }
.log-ok { color:var(--accent2); }
.log-err { color:var(--danger); }
.log-info { color:var(--accent); }

.empty { text-align:center; padding:50px; color:var(--muted); font-family:'Share Tech Mono',monospace; font-size:13px; }
.empty-icon { font-size:36px; margin-bottom:10px; }

.spinner { width:20px; height:20px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:tcSpin .8s linear infinite; display:inline-block; vertical-align:middle; margin-right:8px; }
@keyframes tcSpin { to{transform:rotate(360deg)} }

/* toast */
.tc-toast { position:fixed; bottom:22px; right:22px; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px 18px; font-family:'Share Tech Mono',monospace; font-size:13px; z-index:9999; transition:all .3s ease; max-width:300px; pointer-events:none; }
.tc-toast.hidden { opacity:0; transform:translateY(60px); }
.tc-toast.visible { opacity:1; transform:translateY(0); }
.tc-toast.success { border-color:var(--accent2); color:var(--accent2); }
.tc-toast.error { border-color:var(--danger); color:var(--danger); }
.tc-toast.info { border-color:var(--accent); color:var(--accent); }

.disconnect-btn { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--muted); background:transparent; border:1px solid var(--border); border-radius:6px; padding:6px 12px; cursor:pointer; transition:all .2s; margin-left:12px; }
.disconnect-btn:hover { border-color:var(--danger); color:var(--danger); }

/* tabs */
.tc-tabs { display:flex; gap:6px; margin-bottom:20px; }
.tc-tab { font-family:'Orbitron',monospace; font-size:11px; letter-spacing:2px; font-weight:700; padding:10px 22px; background:var(--panel); border:1px solid var(--border); border-radius:8px 8px 0 0; color:var(--muted); cursor:pointer; transition:all .2s; }
.tc-tab:hover { border-color:var(--accent); color:var(--accent); }
.tc-tab.active { background:rgba(0,212,255,.08); border-color:var(--accent); color:var(--accent); box-shadow:0 -3px 12px rgba(0,212,255,.15); }

/* chat */
.chat-wrap { display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--accent); border-radius:0 12px 12px 12px; overflow:hidden; }
.chat-hdr { padding:16px 22px; border-bottom:1px solid var(--border); background:var(--surface); display:flex; align-items:center; justify-content:space-between; gap:12px; }
.chat-title { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; color:var(--accent); letter-spacing:2px; }
.chat-sub { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--muted); margin-top:3px; }
.chat-msgs { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; min-height:300px; max-height:calc(100vh - 380px); }
.chat-msgs::-webkit-scrollbar { width:8px; }
.chat-msgs::-webkit-scrollbar-track { background:var(--surface); }
.chat-msgs::-webkit-scrollbar-thumb { background:var(--muted); border-radius:4px; }
.chat-msg { display:flex; flex-direction:column; gap:3px; max-width:85%; }
.chat-msg.user { align-self:flex-end; align-items:flex-end; }
.chat-msg.assistant { align-self:flex-start; align-items:flex-start; }
.chat-msg.tool_call,.chat-msg.tool_result { align-self:flex-start; align-items:flex-start; max-width:95%; }
.chat-role { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:1px; color:var(--muted); }
.chat-bubble { padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
.chat-msg.user .chat-bubble { background:rgba(0,212,255,.1); border:1px solid rgba(0,212,255,.25); color:var(--text); border-bottom-right-radius:3px; }
.chat-msg.assistant .chat-bubble { background:var(--surface); border:1px solid var(--border); color:var(--text); border-bottom-left-radius:3px; }
.chat-msg.tool_call .chat-bubble { background:rgba(255,215,0,.05); border:1px solid rgba(255,215,0,.2); color:var(--warn); font-family:'Share Tech Mono',monospace; font-size:11px; border-bottom-left-radius:3px; }
.chat-msg.tool_result .chat-bubble { background:rgba(0,255,157,.04); border:1px solid rgba(0,255,157,.15); color:var(--accent2); font-family:'Share Tech Mono',monospace; font-size:11px; border-bottom-left-radius:3px; max-height:200px; overflow-y:auto; }
.chat-input-row { padding:12px 16px; border-top:1px solid var(--border); background:var(--surface); display:flex; gap:10px; align-items:flex-end; }
.chat-textarea { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 14px; color:var(--text); font-family:'IBM Plex Sans',sans-serif; font-size:13px; resize:none; outline:none; min-height:44px; max-height:120px; transition:border-color .2s; line-height:1.5; }
.chat-textarea:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(0,212,255,.1); }
.chat-thinking { display:flex; gap:4px; align-items:center; padding:4px 0; }
.chat-dot { width:7px; height:7px; border-radius:50%; background:var(--muted); animation:tcChatDot 1.2s ease-in-out infinite; }
.chat-dot:nth-child(2) { animation-delay:.2s; }
.chat-dot:nth-child(3) { animation-delay:.4s; }
@keyframes tcChatDot { 0%,80%,100%{transform:scale(.7);opacity:.4} 40%{transform:scale(1);opacity:1} }

/* ai setup */
.ai-setup-wrap { background:var(--panel); border:1px solid var(--border); border-top:2px solid var(--accent); border-radius:12px; padding:36px 40px; max-width:580px; margin:0 auto; box-shadow:0 0 20px rgba(0,212,255,.15); }
.ai-setup-wrap h2 { font-family:'Orbitron',monospace; font-size:14px; color:var(--accent); letter-spacing:2px; margin-bottom:10px; }
.ai-setup-wrap > p { color:var(--muted); font-size:13px; line-height:1.7; margin-bottom:28px; }
.ai-field { margin-bottom:18px; }
.ai-field label { display:block; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:1px; color:var(--muted); margin-bottom:7px; }
.ai-select { width:100%; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px 14px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:13px; outline:none; cursor:pointer; }
.ai-select:focus { border-color:var(--accent); }
.ai-hint { margin-top:6px; font-size:11px; color:var(--muted); font-family:'Share Tech Mono',monospace; }
.ai-btns { display:flex; gap:10px; margin-top:24px; flex-wrap:wrap; }
.pull-status { margin-top:12px; font-family:'Share Tech Mono',monospace; font-size:12px; color:var(--accent2); background:var(--surface); border:1px solid rgba(0,255,157,.2); border-radius:6px; padding:10px 14px; }
`;

// ── AI Constants ───────────────────────────────────────────────────────────
const AI_DEFAULT_COMMAND_GENERATOR_PROMPT = "Add a command to backup my SD card to my NAS.";

const AI_SYSTEM_PROMPT = `You are an AI assistant embedded in TriggerCMD Mission Control.

## Running existing commands
Use list_commands to see available commands, and run_command to execute them.
Always confirm with the user before running a command unless they explicitly asked you to run one.

## TriggerCMD execution model
Commands registered in TriggerCMD are executed immediately and on-demand when triggered remotely — there is no scheduler or delayed execution. Scripts should always assume they will run immediately when called. Do not ask the user whether the script should "run immediately when triggered" — it always does.

## commands.json field reference
Use these rules when building a command entry:
- trigger: A name for the trigger that will run the command via TRIGGERcmd.
- command: The actual command line that runs the generated script.
- ground: Must be exactly "foreground" or "background". Default to "foreground" unless "background" is requested, or if the target is a Raspberry Pi (its install instructions use background mode). Never use a path or any other value.
- offCommand: Runs when the parameter is "off". Only include when allowParams is true and an off-action makes sense.
- voice: The name an Alexa or Google Assistant device will use for this command. Should generally be a single word to make it easier for the voice assistant to match what the user says. For example, prefer "backup" over "backup sd" unless "backup" is already used by another command (use list_commands to check).
- voiceReply: Use {{result}} only if the script will send a result back to the server within a few seconds using ~/.TRIGGERcmdData/sendresult.sh (Linux/Mac) or %USERPROFILE%\\.TRIGGERcmdData\\SendResult.bat (Windows). Leave blank otherwise.
- allowParams: "true" if the script accepts parameters (e.g. on/off, a color, a number from 0 to 100). Default "false".
- quoteParams: Default "false". Only "true" if the user needs to pass text with spaces as a single parameter.
- mcpToolDescription: Describe what the command does and what parameters it accepts. Example: "Turns the office light on/off or changes its color. Parameters: on, off, or a color like red, blue, green."
- icon: An icon for the command. Should be a relevant unicode emoji. For example if the script turns on/off a lightbulb we could use 💡

## Generating new scripts and commands
When the user asks to ADD, CREATE, SET UP, BUILD, MAKE, or INSTALL a command — treat this as a script generation request, NOT a run request. Do NOT call list_commands or run_command.
Instead follow these steps:
1) Ask clarifying questions needed to define the script (shell/runtime, purpose, parameters).
2) Ask where to save scripts — suggest ~/.TRIGGERcmdData/userscripts or c:\\triggercmd-scripts.
3) Generate a complete, ready-to-save script and a matching TriggerCMD command entry.
4) Prefer safe, idempotent scripts with sensible defaults.
5) BEFORE calling create_triggercmd_script_command, show the user a preview:
   - Full script content
   - Exact commands.json entry (trigger, command, ground, and any optional fields)
   - File paths that would be written
   Then ask for explicit confirmation before calling the tool.
6) If required details are missing, ask before finalizing.

Be concise.`;

const AI_TOOLS_OPENAI = [
  {
    type: "function",
    function: {
      name: "list_commands",
      description: "List all available TriggerCMD commands across all computers",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a TriggerCMD command on a specific computer",
      parameters: {
        type: "object",
        required: ["command", "computer"],
        properties: {
          command: { type: "string", description: "Name of the command to run" },
          computer: { type: "string", description: "Name of the computer that owns the command" },
          parameters: { type: "string", description: "Optional parameters to pass to the command" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_triggercmd_script_command",
      description: "Write a script file to disk and register a matching TriggerCMD command entry in commands.json. Only call this after the user has confirmed the preview.",
      parameters: {
        type: "object",
        required: ["scriptPath", "scriptContent", "scriptType", "commandEntry"],
        properties: {
          scriptPath: { type: "string", description: "Absolute path where the script file will be written" },
          scriptContent: { type: "string", description: "Full content of the script file" },
          scriptType: { type: "string", enum: ["ps1", "bat", "sh", "py", "js"], description: "Script file type/extension" },
          commandEntry: {
            type: "object",
            required: ["trigger", "command", "ground"],
            properties: {
              trigger: { type: "string", description: "Command trigger name used to invoke the command" },
              command: { type: "string", description: "Full command line that executes the script" },
              ground: { type: "string", description: "Working directory for the command" },
              offCommand: { type: "string", description: "Command to run to stop/turn off" },
              voice: { type: "string", description: "Voice alias for the command" },
              voiceReply: { type: "string", description: "Voice reply spoken after execution" },
              allowParams: { type: "string", description: "Whether to allow parameters passed at runtime (true/false)" },
              quoteParams: { type: "string", description: "Whether to quote passed parameters (true/false)" },
              mcpToolDescription: { type: "string", description: "Description exposed to MCP tool consumers" },
              icon: { type: "string", description: "Icon name or URL for the command" },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_commands_json",
      description: "Add or update a command entry in the user's commands.json file at the standard TRIGGERcmd location. Backs up the file before writing. Use this after confirming the command entry with the user.",
      parameters: {
        type: "object",
        required: ["commandEntry"],
        properties: {
          commandEntry: {
            type: "object",
            required: ["trigger", "command", "ground"],
            properties: {
              trigger: { type: "string", description: "Command trigger name used to invoke the command" },
              command: { type: "string", description: "Full command line that executes the script" },
              ground: { type: "string", description: "Working directory for the command" },
              offCommand: { type: "string", description: "Command to run to stop/turn off" },
              voice: { type: "string", description: "Voice alias for the command" },
              voiceReply: { type: "string", description: "Voice reply spoken after execution" },
              allowParams: { type: "string", description: "Whether to allow parameters passed at runtime (true/false)" },
              quoteParams: { type: "string", description: "Whether to quote passed parameters (true/false)" },
              mcpToolDescription: { type: "string", description: "Description exposed to MCP tool consumers" },
              icon: { type: "string", description: "Icon name or URL for the command" },
            },
          },
        },
      },
    },
  },
];

const AI_TOOLS_ANTHROPIC = [
  {
    name: "list_commands",
    description: "List all available TriggerCMD commands across all computers",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_command",
    description: "Run a TriggerCMD command on a specific computer",
    input_schema: {
      type: "object",
      required: ["command", "computer"],
      properties: {
        command: { type: "string", description: "Name of the command to run" },
        computer: { type: "string", description: "Name of the computer that owns the command" },
        parameters: { type: "string", description: "Optional parameters to pass to the command" },
      },
    },
  },
  {
    name: "create_triggercmd_script_command",
    description: "Write a script file to disk and register a matching TriggerCMD command entry in commands.json. Only call this after the user has confirmed the preview.",
    input_schema: {
      type: "object",
      required: ["scriptPath", "scriptContent", "scriptType", "commandEntry"],
      properties: {
        scriptPath: { type: "string", description: "Absolute path where the script file will be written" },
        scriptContent: { type: "string", description: "Full content of the script file" },
        scriptType: { type: "string", enum: ["ps1", "bat", "sh", "py", "js"], description: "Script file type/extension" },
        commandEntry: {
          type: "object",
          required: ["trigger", "command", "ground"],
          properties: {
            trigger: { type: "string", description: "Command trigger name used to invoke the command" },
            command: { type: "string", description: "Full command line that executes the script" },
            ground: { type: "string", description: "Working directory for the command" },
            offCommand: { type: "string", description: "Command to run to stop/turn off" },
            voice: { type: "string", description: "Voice alias for the command" },
            voiceReply: { type: "string", description: "Voice reply spoken after execution" },
            allowParams: { type: "string", description: "Whether to allow parameters passed at runtime (true/false)" },
            quoteParams: { type: "string", description: "Whether to quote passed parameters (true/false)" },
            mcpToolDescription: { type: "string", description: "Description exposed to MCP tool consumers" },
            icon: { type: "string", description: "Icon name or URL for the command" },
          },
        },
      },
    },
  },
  {
    name: "edit_commands_json",
    description: "Add or update a command entry in the user's commands.json file at the standard TRIGGERcmd location. Backs up the file before writing. Use this after confirming the command entry with the user.",
    input_schema: {
      type: "object",
      required: ["commandEntry"],
      properties: {
        commandEntry: {
          type: "object",
          required: ["trigger", "command", "ground"],
          properties: {
            trigger: { type: "string", description: "Command trigger name used to invoke the command" },
            command: { type: "string", description: "Full command line that executes the script" },
            ground: { type: "string", description: "Working directory for the command" },
            offCommand: { type: "string", description: "Command to run to stop/turn off" },
            voice: { type: "string", description: "Voice alias for the command" },
            voiceReply: { type: "string", description: "Voice reply spoken after execution" },
            allowParams: { type: "string", description: "Whether to allow parameters passed at runtime (true/false)" },
            quoteParams: { type: "string", description: "Whether to quote passed parameters (true/false)" },
            mcpToolDescription: { type: "string", description: "Description exposed to MCP tool consumers" },
            icon: { type: "string", description: "Icon name or URL for the command" },
          },
        },
      },
    },
  },
];

const getClientPlatform = () => {
  if (window.electronEnv?.platform) return window.electronEnv.platform;
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "win32";
  if (ua.includes("Mac")) return "darwin";
  if (ua.includes("Linux")) return "linux";
  return "unknown";
};

const CLIENT_OS_LABELS = { win32: "Windows", darwin: "macOS", linux: "Linux" };

const getStandardCommandsJsonPath = (platform) => {
  if (platform === "win32") return "%USERPROFILE%\\.TRIGGERcmdData\\commands.json";
  return "~/.TRIGGERcmdData/commands.json";
};

const buildSystemPrompt = (commandsJsonPath = null) => {
  const platform = getClientPlatform();
  const osLabel = CLIENT_OS_LABELS[platform] || platform;
  const resolvedPath = commandsJsonPath || getStandardCommandsJsonPath(platform);
  const lines = [
    `- OS: ${osLabel}`,
    `- commands.json: ${resolvedPath} — the edit_commands_json tool reads and writes this path automatically. Do NOT ask the user for this path.`,
  ];
  return `${AI_SYSTEM_PROMPT}\n\nClient context:\n${lines.join('\n')}`;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("setup"); // setup | loading | dashboard
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [allCmds, setAllCmds] = useState([]);
  const [computers, setComputers] = useState({});
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [cmdStates, setCmdStates] = useState({}); // id -> null|'running'|'success'|'error'
  const [paramValues, setParamValues] = useState({});
  const [panels, setPanels] = useState({});
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [panelStates, setPanelStates] = useState({}); // id -> null|'running'|'success'|'error'
  const [panelDropdownValues, setPanelDropdownValues] = useState({});
  const [panelParamValues, setPanelParamValues] = useState({});
  const [panelOptionStates, setPanelOptionStates] = useState({}); // id -> { option, state }
  const [executed, setExecuted] = useState(0);
  const [log, setLog] = useState([{ time: "--:--:--", msg: "System initialized. Awaiting commands.", type: "info" }]);
  const [toast, setToast] = useState({ msg: "", type: "info", vis: false });
  const [clock, setClock] = useState("");
  const toastTimer = useRef(null);

  // AI Chat
  const [activeTab, setActiveTab] = useState("commands");
  const [commandsJsonPath, setCommandsJsonPath] = useState(null);
  const [aiConfig, setAiConfig] = useState(null);
  const [aiDraft, setAiDraft] = useState({ provider: "openai", apiKey: "", model: "gpt-5.4", baseUrl: "http://localhost:11434" });
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState(AI_DEFAULT_COMMAND_GENERATOR_PROMPT);
  const [chatLoading, setChatLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState("");
  const chatEndRef = useRef(null);
  const apiConvRef = useRef([]);

  // inject CSS once
  useEffect(() => {
    const id = "tc-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id; el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);

  // detect commands.json at the standard TRIGGERcmd location
  useEffect(() => {
    if (!window.electronEnv?.commandsJson) return;
    window.electronEnv.commandsJson.getInfo().then(info => {
      if (info.exists) setCommandsJsonPath(info.path);
    }).catch(() => {});
  }, []);

  // auto-connect with saved token
  useEffect(() => {
    const saved = localStorage.getItem("tc-token");
    if (saved) {
      setTokenInput(saved);
      autoConnect(saved);
    }
  }, []);

  const autoConnect = async (tok) => {
    setPhase("loading");
    try {
      const [cmds, panelRecords] = await Promise.all([fetchCommands(tok), fetchPanelButtons(tok)]);
      const groups = {};
      cmds.forEach((c) => {
        const name = c.computer?.name || "Unknown";
        (groups[name] = groups[name] || []).push(c);
      });
      const panelGroups = normalizePanels(panelRecords);
      setToken(tok);
      setAllCmds(cmds);
      setComputers(groups);
      setPanels(panelGroups);
      setSelectedPanel(Object.keys(panelGroups)[0] || null);
      setPhase("dashboard");
      setLog((l) => [{ time: timestamp(), msg: `Connected. ${Object.keys(groups).length} computers, ${cmds.length} commands.`, type: "ok" }, ...l].slice(0, 60));
    } catch {
      localStorage.removeItem("tc-token");
      setPhase("setup");
    }
  };

  // clock
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const off = -n.getTimezoneOffset() / 60;
      setClock(`${n.toTimeString().slice(0,8)} UTC${off >= 0 ? "+" : ""}${off}:00`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Load AI config from localStorage or env vars
  useEffect(() => {
    const saved = localStorage.getItem("tc-ai-config");
    if (saved) {
      try { setAiConfig(JSON.parse(saved)); } catch {}
    } else {
      const envOpenAI = window.electronEnv?.openaiApiKey;
      const envAnthropic = window.electronEnv?.anthropicApiKey;
      if (envOpenAI) {
        const cfg = { provider: "openai", apiKey: envOpenAI, model: "gpt-5.4" };
        setAiConfig(cfg);
        localStorage.setItem("tc-ai-config", JSON.stringify(cfg));
      } else if (envAnthropic) {
        const cfg = { provider: "anthropic", apiKey: envAnthropic, model: "claude-opus-4-7" };
        setAiConfig(cfg);
        localStorage.setItem("tc-ai-config", JSON.stringify(cfg));
      }
    }
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  const addLog = (msg, type = "info") =>
    setLog((l) => [{ time: timestamp(), msg, type }, ...l].slice(0, 60));

  const showToast = (msg, type = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, vis: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, vis: false })), 3000);
  };

  const handleConnect = async () => {
    if (!tokenInput.trim()) { showToast("Please enter your token", "error"); return; }
    setPhase("loading");
    const tok = tokenInput.trim();
    try {
      const [cmds, panelRecords] = await Promise.all([fetchCommands(tok), fetchPanelButtons(tok)]);
      const groups = {};
      cmds.forEach((c) => {
        const name = c.computer?.name || "Unknown";
        (groups[name] = groups[name] || []).push(c);
      });
      const panelGroups = normalizePanels(panelRecords);
      setToken(tok);
      localStorage.setItem("tc-token", tok);
      setAllCmds(cmds);
      setComputers(groups);
      setPanels(panelGroups);
      setSelectedPanel(Object.keys(panelGroups)[0] || null);
      setPhase("dashboard");
      addLog(`Connected. ${Object.keys(groups).length} computers, ${cmds.length} commands.`, "ok");
      showToast("Connected successfully!", "success");
    } catch (e) {
      setPhase("setup");
      showToast("Connection failed: " + e.message, "error");
      addLog("Connection failed: " + e.message, "err");
    }
  };

  const selectComputer = (name) => {
    setSelected(name);
    setSearch("");
  };

  const setCmd = (id, state) =>
    setCmdStates((s) => ({ ...s, [id]: state }));

  const setPanelState = (id, state) =>
    setPanelStates((s) => ({ ...s, [id]: state }));

  const handleRun = async (computer, name, id, hasParams) => {
    const params = hasParams ? (paramValues[id] || "").trim() : undefined;
    setCmd(id, "running");
    addLog(`Sending: [${computer}] ${name}${params ? ` "${params}"` : ""}`, "info");
    try {
      await triggerCommand(token, computer, name, params);
      setCmd(id, "success");
      setExecuted((x) => x + 1);
      addLog(`✓ Executed: ${name} on ${computer}`, "ok");
      showToast(`✓ ${name} triggered!`, "success");
      setTimeout(() => setCmd(id, null), 3000);
    } catch (e) {
      setCmd(id, "error");
      addLog(`✗ Failed: ${name} — ${e.message}`, "err");
      showToast(`✗ Failed: ${e.message}`, "error");
      setTimeout(() => setCmd(id, null), 4000);
    }
  };

  const visibleCmds = selected
    ? (computers[selected] || []).filter((c) =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.mcpToolDescription || "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const panelNames = Object.keys(panels);
  const selectedPanelButtons = selectedPanel ? (panels[selectedPanel] || []) : [];

  const handleRunPanel = async (panelName, panelButton, forcedParams, optionLabel) => {
    const dropdownValue = panelDropdownValues[panelButton.id] || "";
    const typedValue = panelButton.useRegex ? (panelParamValues[panelButton.id] || "").trim() : "";
    const params = forcedParams ?? (typedValue || dropdownValue || undefined);
    if (optionLabel) {
      setPanelOptionStates((s) => ({ ...s, [panelButton.id]: { option: optionLabel, state: "running" } }));
    }
    setPanelState(panelButton.id, "running");
    addLog(`Sending panel: [${panelName}] ${panelButton.buttonName}${params ? ` "${params}"` : ""}`, "info");
    try {
      await triggerPanelButton(token, panelName, panelButton.buttonName, params);
      setPanelState(panelButton.id, "success");
      if (optionLabel) {
        setPanelOptionStates((s) => ({ ...s, [panelButton.id]: { option: optionLabel, state: "success" } }));
        setTimeout(() => {
          setPanelOptionStates((s) => {
            const current = s[panelButton.id];
            if (!current || current.option !== optionLabel || current.state !== "success") return s;
            const next = { ...s };
            delete next[panelButton.id];
            return next;
          });
        }, 1300);
      }
      setExecuted((x) => x + 1);
      addLog(`✓ Executed panel button: ${panelButton.buttonName} on ${panelName}`, "ok");
      showToast(`✓ ${panelButton.buttonName} triggered!`, "success");
      setTimeout(() => setPanelState(panelButton.id, null), 3000);
    } catch (e) {
      setPanelState(panelButton.id, "error");
      if (optionLabel) {
        setPanelOptionStates((s) => ({ ...s, [panelButton.id]: { option: optionLabel, state: "error" } }));
        setTimeout(() => {
          setPanelOptionStates((s) => {
            const current = s[panelButton.id];
            if (!current || current.option !== optionLabel || current.state !== "error") return s;
            const next = { ...s };
            delete next[panelButton.id];
            return next;
          });
        }, 1700);
      }
      addLog(`✗ Panel failed: ${panelButton.buttonName} — ${e.message}`, "err");
      showToast(`✗ Failed: ${e.message}`, "error");
      setTimeout(() => setPanelState(panelButton.id, null), 4000);
    }
  };

  // ── AI Chat ──────────────────────────────────────────────────────────────
  const saveAiConfig = () => {
    let cfg = { ...aiDraft };
    if (aiDraft.provider === "triggercmd") {
      cfg = { provider: "triggercmd", apiKey: token.trim(), model: "gpt-4-tcmd" };
    }
    setAiConfig(cfg);
    localStorage.setItem("tc-ai-config", JSON.stringify(cfg));
    setShowAiSetup(false);
    setOllamaStatus("");
    addLog(`AI configured: ${cfg.provider} / ${cfg.model}`, "info");
  };

  // Keep TRIGGERcmd AI config token in sync with the active commands token.
  useEffect(() => {
    if (!token || !aiConfig || aiConfig.provider !== "triggercmd") return;
    if ((aiConfig.apiKey || "").trim() === token.trim()) return;
    const next = { ...aiConfig, apiKey: token.trim() };
    setAiConfig(next);
    localStorage.setItem("tc-ai-config", JSON.stringify(next));
  }, [token, aiConfig]);

  const executeTool = async (name, args) => {
    if (name === "list_commands") {
      const commands = await fetchCommands(token);
      return JSON.stringify(commands.map(c => ({
        name: c.name,
        voice: c.voice,
        computer: c.computer?.name,
        mcpToolDescription: c.mcpToolDescription || "",
      })), null, 2);
    }
    if (name === "run_command") {
      const result = await triggerCommand(token, args.computer, args.command, args.parameters);
      addLog(`AI triggered: ${args.command} on ${args.computer}`, "ok");
      setExecuted(x => x + 1);
      return JSON.stringify(result, null, 2);
    }
    if (name === "create_triggercmd_script_command") {
      if (!window.electronEnv?.fileSystem || !window.electronEnv?.commandsJson) {
        return JSON.stringify({ error: "File system access is only available in the Electron desktop app." });
      }
      try {
        const { scriptPath, scriptContent, scriptType, commandEntry } = args;
        const platform = getClientPlatform();

        const scriptResult = await window.electronEnv.fileSystem.writeFile(scriptPath, scriptContent);

        const normalizedEntry = normalizeCommandEntry({
          ...commandEntry,
          command: commandEntry.command || generateCommandString(scriptPath, scriptType, platform, commandEntry.allowParams === "true"),
        });

        const raw = await window.electronEnv.commandsJson.read();
        const { commands, action } = upsertCommandEntry(JSON.parse(raw), normalizedEntry);
        const jsonResult = await window.electronEnv.commandsJson.write(JSON.stringify(commands, null, 2));

        addLog(`AI wrote script: ${scriptPath}`, "ok");
        addLog(`AI ${action} command "${normalizedEntry.trigger}" in commands.json`, "ok");
        return JSON.stringify({ success: true, scriptFile: scriptResult, commandsJson: jsonResult, action, trigger: normalizedEntry.trigger });
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    }
    if (name === "edit_commands_json") {
      if (!window.electronEnv?.commandsJson) {
        return JSON.stringify({ error: "File system access is only available in the Electron desktop app." });
      }
      try {
        const raw = await window.electronEnv.commandsJson.read();
        const commands = JSON.parse(raw);
        const { commandEntry } = args;
        const idx = commands.findIndex(c => c.trigger === commandEntry.trigger);
        if (idx >= 0) {
          commands[idx] = { ...commands[idx], ...commandEntry };
        } else {
          commands.push(commandEntry);
        }
        const result = await window.electronEnv.commandsJson.write(JSON.stringify(commands, null, 2));
        const action = idx >= 0 ? "updated" : "added";
        addLog(`AI ${action} command "${commandEntry.trigger}" in commands.json`, "ok");
        return JSON.stringify({ success: true, action, trigger: commandEntry.trigger, ...result });
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    }
    return JSON.stringify({ error: "Unknown tool: " + name });
  };

  const toAnthropicMsgs = (msgs) => {
    const result = [];
    for (const msg of msgs) {
      if (msg.role === "system") continue;
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.tool_calls) {
          result.push({
            role: "assistant",
            content: msg.tool_calls.map(tc => ({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || "{}"),
            })),
          });
        } else {
          result.push({ role: "assistant", content: msg.content || "" });
        }
      } else if (msg.role === "tool") {
        const toolResult = { type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content };
        const last = result[result.length - 1];
        if (last && last.role === "user" && Array.isArray(last.content)) {
          last.content.push(toolResult);
        } else {
          result.push({ role: "user", content: [toolResult] });
        }
      }
    }
    return result;
  };

  const runOpenAILoop = async () => {
    const isElectron = window.electronEnv?.isElectron;
    const baseUrl = aiConfig.provider === "ollama"
      ? (isElectron ? `${aiConfig.baseUrl}/v1` : "/ollama/v1")
      : "https://api.openai.com/v1";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${aiConfig.provider === "ollama" ? "ollama" : aiConfig.apiKey}`,
    };
    const msgs = [{ role: "system", content: buildSystemPrompt(commandsJsonPath) }, ...apiConvRef.current];
    while (true) {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: aiConfig.model, messages: msgs, tools: AI_TOOLS_OPENAI, tool_choice: "auto" }),
      });
      if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No response from AI");
      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls?.length) {
        const aMsg = choice.message;
        msgs.push(aMsg);
        apiConvRef.current.push(aMsg);
        for (const tc of aMsg.tool_calls) {
          const args = JSON.parse(tc.function.arguments || "{}");
          const label = `${tc.function.name}(${Object.entries(args).map(([k, v]) => `${k}: "${v}"`).join(", ")})`;
          setChatMsgs(prev => [...prev, { role: "tool_call", content: label }]);
          let result;
          try {
            result = await executeTool(tc.function.name, args);
          } catch (err) {
            result = JSON.stringify({ error: err.message });
          }
          setChatMsgs(prev => [...prev, { role: "tool_result", content: result.length > 800 ? result.slice(0, 800) + "\n..." : result }]);
          const tMsg = { role: "tool", tool_call_id: tc.id, content: result };
          msgs.push(tMsg);
          apiConvRef.current.push(tMsg);
        }
      } else {
        const content = choice.message?.content || "";
        apiConvRef.current.push({ role: "assistant", content });
        setChatMsgs(prev => [...prev, { role: "assistant", content }]);
        break;
      }
    }
  };

  const runAnthropicLoop = async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": aiConfig.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    while (true) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: aiConfig.model,
          max_tokens: 4096,
          system: buildSystemPrompt(commandsJsonPath),
          messages: toAnthropicMsgs(apiConvRef.current),
          tools: AI_TOOLS_ANTHROPIC,
        }),
      });
      if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      if (data.stop_reason === "tool_use") {
        const toolUses = data.content.filter(b => b.type === "tool_use");
        const aMsg = {
          role: "assistant",
          content: null,
          tool_calls: toolUses.map(tu => ({ id: tu.id, type: "function", function: { name: tu.name, arguments: JSON.stringify(tu.input) } })),
        };
        apiConvRef.current.push(aMsg);
        for (const tu of toolUses) {
          const label = `${tu.name}(${Object.entries(tu.input).map(([k, v]) => `${k}: "${v}"`).join(", ")})`;
          setChatMsgs(prev => [...prev, { role: "tool_call", content: label }]);
          let result;
          try {
            result = await executeTool(tu.name, tu.input);
          } catch (err) {
            result = JSON.stringify({ error: err.message });
          }
          setChatMsgs(prev => [...prev, { role: "tool_result", content: result.length > 800 ? result.slice(0, 800) + "\n..." : result }]);
          apiConvRef.current.push({ role: "tool", tool_call_id: tu.id, content: result });
        }
      } else {
        const content = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        apiConvRef.current.push({ role: "assistant", content });
        setChatMsgs(prev => [...prev, { role: "assistant", content }]);
        break;
      }
    }
  };

  const pullOllamaModel = async () => {
    setOllamaStatus("Connecting to Ollama...");
    const isElectron = window.electronEnv?.isElectron;
    const ollamaBase = isElectron ? aiDraft.baseUrl : "";
    const pullPath = isElectron ? `${ollamaBase}/api/pull` : "/ollama/api/pull";
    try {
      const resp = await fetch(pullPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: aiDraft.model, stream: true }),
      });
      if (!resp.ok) throw new Error(`Ollama responded with ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          try {
            const d = JSON.parse(line);
            if (d.total && d.completed) setOllamaStatus(`${d.status} ${Math.round((d.completed / d.total) * 100)}%`);
            else if (d.status) setOllamaStatus(d.status);
          } catch {}
        }
      }
      setOllamaStatus("✓ Model ready!");
    } catch (e) {
      setOllamaStatus("✗ " + e.message);
    }
  };

  // TRIGGERcmd Subscription chat loop
  const runTriggercmdLoop = async () => {
    // Prefer sending directly to /message; server will auto-create conversationId when omitted.
    let conversationId = apiConvRef.current.find(m => m.conversationId)?.conversationId;
    const chatToken = token.trim();
    if (!chatToken) {
      throw new Error("Missing active TRIGGERcmd token. Reconnect on Commands and try again.");
    }

    // Send message (continue existing conversation when we have an ID).
    const userMsg = apiConvRef.current.filter(m => m.role === "user").slice(-1)[0]?.content || chatInput;
    const resp = await fetch(`${API_BASE}/api/v1/chat/message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${chatToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: userMsg,
        ...(conversationId ? { conversationId } : {}),
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      if (resp.status === 401) {
        throw new Error("TRIGGERcmd token rejected for chat API (401). Reconnect on Commands, then click Configure in AI Chat and save TRIGGERcmd again.");
      }
      if (resp.status === 402) {
        throw new Error("TRIGGERcmd subscription required. Please activate your subscription, then try again.");
      }
      throw new Error(`TRIGGERcmd API error: ${resp.status} ${err || "Request failed"}`);
    }

    const data = await resp.json();
    conversationId = data.conversationId || conversationId;

    // Keep local history aligned with the already-added local user message; only append assistant reply.
    const assistantContent = data.assistantMessage?.content || "No assistant response returned.";
    apiConvRef.current.push({ role: "assistant", content: assistantContent, conversationId });
    setChatMsgs(prev => [...prev, { role: "assistant", content: assistantContent }]);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatLoading(true);
    setChatMsgs(prev => [...prev, { role: "user", content: text }]);
    apiConvRef.current.push({ role: "user", content: text });
    try {
      const provider = aiConfig?.provider || "unknown";
      const model = aiConfig?.model || "unknown";
      addLog(`AI chat send — provider: ${provider}, model: ${model}`, "info");
      if (provider === "triggercmd") {
        addLog("System prompt: server-controlled (not using local AI_SYSTEM_PROMPT)", "err");
      } else {
        addLog(`System prompt (first 100 chars): ${buildSystemPrompt(commandsJsonPath).slice(0, 100)}…`, "info");
      }
      console.log("[AI Chat] provider:", provider, "model:", model);
      console.log("[AI Chat] system prompt:", buildSystemPrompt(commandsJsonPath));
      if (aiConfig.provider === "anthropic") await runAnthropicLoop();
      else if (aiConfig.provider === "triggercmd") await runTriggercmdLoop();
      else await runOpenAILoop();
    } catch (e) {
      setChatMsgs(prev => [...prev, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const activityLogBlock = (
    <div className="tc-log">
      <div className="log-hdr">// ACTIVITY LOG</div>
      <div className="log-body">
        {log.map((e, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">{e.time}</span>
            <span className={`log-${e.type}`}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="tc-root">
      <div className="tc-inner">
        {/* Header */}
        <div className="tc-header">
          <div className="tc-logo">
            <div className="tc-logo-icon"><img src={iconUrl} alt="TriggerCMD" style={{ width: 48, height: 48, objectFit: 'contain' }} /></div>
            <div>
              <h1>TRIGGERCMD</h1>
              <span>MISSION CONTROL // v{version}</span>
            </div>
          </div>
          <div className="tc-status">
            <div className={`tc-dot ${phase === "dashboard" ? "on" : ""}`} />
            <span>{phase === "dashboard" ? "CONNECTED" : "OFFLINE"}</span>
            <span style={{ color: "var(--border)", margin: "0 10px" }}>|</span>
            <span>{clock}</span>
            {phase === "dashboard" && (
              <button className="disconnect-btn" onClick={() => {
                localStorage.removeItem("tc-token");
                setPhase("setup");
                setToken("");
                setAllCmds([]);
                setComputers({});
                setSelected(null);
                setPanels({});
                setSelectedPanel(null);
                setPanelStates({});
                setPanelOptionStates({});
                setPanelDropdownValues({});
                setPanelParamValues({});
                setActiveTab("commands");
              }}>
                DISCONNECT
              </button>
            )}
          </div>
        </div>

        {/* Setup */}
        {(phase === "setup" || phase === "loading") && (
          <div className="tc-setup">
            <h2><img src={iconUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain', verticalAlign: 'middle', marginRight: 8 }} />INITIALIZE CONNECTION</h2>
            <p>
              Enter your TRIGGERcmd token to connect.<br />
              Get yours at <a href="https://www.triggercmd.com" target="_blank" rel="noreferrer">triggercmd.com</a> → Profile → Token.
            </p>
            <div className="tc-input-row">
              <input
                className="tc-input"
                type="password"
                placeholder="Paste your token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                disabled={phase === "loading"}
              />
              <button className="btn btn-cyan" onClick={handleConnect} disabled={phase === "loading"}>
                {phase === "loading" ? <><span className="spinner" />CONNECTING</> : "CONNECT"}
              </button>
            </div>
            <p className="tc-note">API calls are proxied server-side — your token is never exposed to the browser.</p>
          </div>
        )}

        {/* Dashboard */}
        {phase === "dashboard" && (
          <>
            {/* Tab Nav */}
            <div className="tc-tabs">
              <button className={`tc-tab ${activeTab === "commands" ? "active" : ""}`} onClick={() => setActiveTab("commands")}>🖥 COMMANDS</button>
              <button className={`tc-tab ${activeTab === "panels" ? "active" : ""}`} onClick={() => setActiveTab("panels")}>📋 PANELS</button>
              <button className={`tc-tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => { setActiveTab("chat"); if (!aiConfig) setShowAiSetup(true); }}>🤖 AI CHAT</button>
            </div>

            {activeTab === "commands" && (<>
            {/* Stats */}
            <div className="tc-stats">
              <div className="stat blue">
                <div className="stat-label">// Computers</div>
                <div className="stat-val">{Object.keys(computers).length}</div>
              </div>
              <div className="stat green">
                <div className="stat-label">// Commands</div>
                <div className="stat-val">{allCmds.length}</div>
              </div>
              <div className="stat orange">
                <div className="stat-label">// Executed</div>
                <div className="stat-val">{executed}</div>
              </div>
            </div>

            {/* Main grid */}
            <div className="tc-grid">
              {/* Sidebar */}
              <div className="tc-sidebar">
                <div className="sidebar-lbl">// COMPUTERS</div>
                {Object.entries(computers).map(([name, cmds]) => (
                  <button
                    key={name}
                    className={`comp-btn ${selected === name ? "active" : ""}`}
                    onClick={() => selectComputer(name)}
                  >
                    <span style={{ fontSize: 18 }}>🖥️</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div className="comp-name">{name}</div>
                      <div className="comp-count">{cmds.length} command{cmds.length !== 1 ? "s" : ""}</div>
                    </span>
                  </button>
                ))}
              </div>

              {/* Commands panel */}
              <div className="tc-panel">
                <div className="panel-hdr">
                  <div>
                    <div className="panel-title">{selected ? selected.toUpperCase() : "SELECT A COMPUTER"}</div>
                    <div className="panel-sub">
                      {selected
                        ? `${computers[selected]?.length} command${computers[selected]?.length !== 1 ? "s" : ""} available`
                        : "Choose a target from the sidebar"}
                    </div>
                  </div>
                  {selected && (
                    <input
                      className="search"
                      placeholder="🔍 filter..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  )}
                </div>

                <div className="cmds-list">
                  {!selected ? (
                    <div className="empty">
                      <div className="empty-icon">🖥️</div>
                      Select a computer to view its commands
                    </div>
                  ) : visibleCmds.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">🔍</div>
                      No commands match your filter
                    </div>
                  ) : (
                    visibleCmds.map((cmd, i) => {
                      const state = cmdStates[cmd.id];
                      const hasParams = !!cmd.allowParams;
                      return (
                        <div
                          key={cmd.id}
                          className={`cmd-card ${state || ""}`}
                          style={{ animationDelay: `${i * 8}ms` }}
                        >
                          {cmd.icon && <div className="cmd-icon-box">{cmd.icon}</div>}
                          <div className="cmd-body">
                            <div className="cmd-name">{cmd.name}</div>
                            {cmd.mcpToolDescription && (
                              <div className="cmd-desc">{cmd.mcpToolDescription}</div>
                            )}
                            {hasParams && (
                              <div className="params-row">
                                <input
                                  className="params-input"
                                  placeholder="Parameters..."
                                  value={paramValues[cmd.id] || ""}
                                  onChange={(e) =>
                                    setParamValues((p) => ({ ...p, [cmd.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => e.key === "Enter" && !state && handleRun(cmd.computer?.name, cmd.name, cmd.id, true)}
                                  disabled={!!state}
                                />
                              </div>
                            )}
                          </div>
                          <div className="cmd-actions">
                            {state && (
                              <span className={`cmd-status-text ${state}`}>
                                {state === "running" ? "⏳ running" : state === "success" ? "✓ sent" : "✗ error"}
                              </span>
                            )}
                            <button
                              className="btn btn-green"
                              disabled={!!state}
                              onClick={() => handleRun(cmd.computer?.name, cmd.name, cmd.id, hasParams)}
                            >
                              {state === "running" ? <><span className="spinner" style={{width:12,height:12}} />...</> : "▶ RUN"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Activity log */}
            {activityLogBlock}
            </>)}

            {/* Panels */}
            {activeTab === "panels" && (
              <>
                <div className="tc-grid">
                  <div className="tc-sidebar">
                    <div className="sidebar-lbl">// PANELS</div>
                    {panelNames.length === 0 ? (
                      <div className="empty" style={{ padding: "22px 8px", fontSize: 12 }}>
                        No panels found
                      </div>
                    ) : (
                      panelNames.map((name) => {
                        const btns = panels[name] || [];
                        return (
                          <button
                            key={name}
                            className={`comp-btn ${selectedPanel === name ? "active" : ""}`}
                            onClick={() => setSelectedPanel(name)}
                          >
                            <span style={{ fontSize: 18 }}>📋</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <div className="comp-name">{name}</div>
                              <div className="comp-count">{btns.length} button{btns.length !== 1 ? "s" : ""}</div>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="tc-panel">
                    <div className="panel-hdr">
                      <div>
                        <div className="panel-title">{selectedPanel ? selectedPanel.toUpperCase() : "SELECT A PANEL"}</div>
                        <div className="panel-sub">
                          {selectedPanel
                            ? `${selectedPanelButtons.length} button${selectedPanelButtons.length !== 1 ? "s" : ""} available`
                            : "Choose a panel from the sidebar"}
                        </div>
                      </div>
                    </div>

                    <div className="cmds-list">
                      {panelNames.length === 0 ? (
                        <div className="empty">
                          <div className="empty-icon">📋</div>
                          No panels available for this account
                        </div>
                      ) : !selectedPanel ? (
                        <div className="empty">
                          <div className="empty-icon">📋</div>
                          Select a panel to view its buttons
                        </div>
                      ) : selectedPanelButtons.length === 0 ? (
                        <div className="empty">
                          <div className="empty-icon">🧩</div>
                          This panel has no buttons
                        </div>
                      ) : (
                        selectedPanelButtons.map((panelButton, i) => {
                          const state = panelStates[panelButton.id];
                          const hasPresetParams = panelButton.paramOptions.length > 0;
                          const showTextInput = panelButton.useRegex;
                          return (
                            <div
                              key={panelButton.id}
                              className={`cmd-card ${state || ""}`}
                              style={{ animationDelay: `${i * 8}ms` }}
                            >
                              <div className="cmd-body">
                                <div className="cmd-name">{panelButton.buttonName}</div>
                                <div className="cmd-desc">Panel button trigger</div>
                                <div className="params-row">
                                  {hasPresetParams && (
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
                                      {panelButton.paramOptions.map((opt) => {
                                        const selectedOpt = panelDropdownValues[panelButton.id] === opt;
                                        const optionState = panelOptionStates[panelButton.id];
                                        const isThisOption = optionState?.option === opt;
                                        const isRunning = isThisOption && optionState?.state === "running";
                                        const isSuccess = isThisOption && optionState?.state === "success";
                                        const isError = isThisOption && optionState?.state === "error";
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            className="btn btn-ghost"
                                            style={{
                                              padding: "6px 10px",
                                              fontSize: 10,
                                              borderColor: isRunning ? "var(--warn)" : isSuccess ? "var(--accent2)" : isError ? "var(--danger)" : selectedOpt ? "var(--accent2)" : "var(--border)",
                                              color: isRunning ? "var(--warn)" : isSuccess ? "var(--accent2)" : isError ? "var(--danger)" : selectedOpt ? "var(--accent2)" : "var(--muted)",
                                              background: isRunning ? "rgba(255,215,0,.1)" : isSuccess ? "rgba(0,255,157,.1)" : isError ? "rgba(255,51,102,.1)" : selectedOpt ? "rgba(0,255,157,.08)" : "transparent",
                                            }}
                                            disabled={!!state}
                                            onClick={() => {
                                              setPanelDropdownValues((p) => ({ ...p, [panelButton.id]: opt }));
                                              handleRunPanel(panelButton.panelName, panelButton, opt, opt);
                                            }}
                                          >
                                            {isRunning ? `${opt} ...` : isSuccess ? `${opt} ✓` : isError ? `${opt} ✗` : opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {showTextInput && (
                                    <input
                                      className="params-input"
                                      placeholder={hasPresetParams ? "Or enter regex text..." : "Enter regex text..."}
                                      value={panelParamValues[panelButton.id] || ""}
                                      onChange={(e) =>
                                        setPanelParamValues((p) => ({ ...p, [panelButton.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => e.key === "Enter" && !state && handleRunPanel(panelButton.panelName, panelButton)}
                                      disabled={!!state}
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="cmd-actions">
                                {state && (
                                  <span className={`cmd-status-text ${state}`}>
                                    {state === "running" ? "⏳ running" : state === "success" ? "✓ sent" : "✗ error"}
                                  </span>
                                )}
                                {!hasPresetParams && (
                                  <button
                                    className="btn btn-green"
                                    disabled={!!state}
                                    onClick={() => handleRunPanel(panelButton.panelName, panelButton)}
                                  >
                                    {state === "running" ? <><span className="spinner" style={{width:12,height:12}} />...</> : "▶ RUN"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {activityLogBlock}
              </>
            )}

            {/* AI Chat */}
            {activeTab === "chat" && (
              (showAiSetup || !aiConfig) ? (
                  <div className="ai-setup-wrap">
                  <h2>🤖 CONFIGURE AI ASSISTANT</h2>
                  <p>Connect an AI model to chat with your TriggerCMD commands. The assistant can list and run commands on your behalf.</p>
                  <div className="ai-field">
                    <label>// PROVIDER</label>
                    <select className="ai-select" value={aiDraft.provider} onChange={e => {
                      const p = e.target.value;
                      const m = { openai: "gpt-5.4", anthropic: "claude-opus-4-7", ollama: "gpt-oss:20b", triggercmd: "gpt-4-tcmd" };
                      setAiDraft(d => ({ ...d, provider: p, model: m[p], apiKey: p === "triggercmd" ? (token || d.apiKey) : d.apiKey }));
                      setOllamaStatus("");
                    }}>
                      <option value="openai">OpenAI (gpt-5.4, etc.)</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="ollama">Ollama — Local Model</option>
                      <option value="triggercmd">TRIGGERcmd Subscription</option>
                    </select>
                  </div>
                  {aiDraft.provider !== "ollama" && aiDraft.provider !== "triggercmd" && (
                    <div className="ai-field">
                      <label>// API KEY</label>
                      <input className="tc-input" type="password" placeholder={`Your ${aiDraft.provider === "openai" ? "OpenAI" : "Anthropic"} API key...`} value={aiDraft.apiKey} onChange={e => setAiDraft(d => ({ ...d, apiKey: e.target.value }))} />
                      <p className="ai-hint">Stored locally in this app only.</p>
                    </div>
                  )}
                  {aiDraft.provider === "ollama" && (
                    <div className="ai-field">
                      <label>// OLLAMA BASE URL</label>
                      <input className="tc-input" placeholder="http://localhost:11434" value={aiDraft.baseUrl} onChange={e => setAiDraft(d => ({ ...d, baseUrl: e.target.value }))} />
                      <p className="ai-hint">Ollama must be running locally. <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{color:"var(--accent)"}}>ollama.com</a></p>
                    </div>
                  )}
                  <div className="ai-field">
                    <label>// MODEL</label>
                    <input className="tc-input" placeholder={aiDraft.provider === "ollama" ? "gpt-oss:20b" : aiDraft.provider === "anthropic" ? "claude-opus-4-7" : "gpt-5.4"} value={aiDraft.model} onChange={e => setAiDraft(d => ({ ...d, model: e.target.value }))} />
                  </div>
                  {aiDraft.provider === "ollama" && (
                    <div style={{marginBottom:8}}>
                      <button className="btn btn-ghost" onClick={pullOllamaModel} disabled={!aiDraft.model.trim()}>⬇ PULL MODEL</button>
                      {ollamaStatus && <div className="pull-status">{ollamaStatus}</div>}
                    </div>
                  )}
                  <div className="ai-btns">
                    {aiConfig && <button className="btn btn-ghost" onClick={() => { setShowAiSetup(false); setOllamaStatus(""); }}>CANCEL</button>}
                    <button
                      className="btn btn-cyan"
                      disabled={!aiDraft.model.trim() || ((aiDraft.provider !== "ollama" && aiDraft.provider !== "triggercmd") && !aiDraft.apiKey.trim())}
                      onClick={saveAiConfig}
                    >
                      SAVE &amp; START CHATTING
                    </button>
                  </div>
                  </div>
                ) : (
                  <div className="chat-wrap">
                  <div className="chat-hdr">
                    <div>
                      <div className="chat-title">🤖 AI ASSISTANT</div>
                      <div className="chat-sub">{aiConfig?.provider?.toUpperCase()} // {aiConfig?.model}</div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="btn btn-ghost" style={{fontSize:10,padding:"6px 12px"}} onClick={() => { setChatMsgs([]); apiConvRef.current = []; }}>NEW CHAT</button>
                      <button className="btn btn-ghost" style={{fontSize:10,padding:"6px 12px"}} onClick={() => { setShowAiSetup(true); setAiDraft({...aiConfig}); }}>CONFIGURE</button>
                    </div>
                  </div>
                  <div className="chat-msgs">
                    {chatMsgs.length === 0 && (
                      <div className="empty"><div className="empty-icon">🤖</div>Ask me to generate scripts, install commands, or run TriggerCMD commands.</div>
                    )}
                    {chatMsgs.map((m, i) => (
                      <div key={i} className={`chat-msg ${m.role}`}>
                        <span className="chat-role">{m.role === "user" ? "YOU" : m.role === "assistant" ? "AI" : m.role === "tool_call" ? "⚙ TOOL CALL" : "⚙ RESULT"}</span>
                        <div className="chat-bubble">{m.content}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="chat-msg assistant">
                        <span className="chat-role">AI</span>
                        <div className="chat-bubble"><div className="chat-thinking"><div className="chat-dot"/><div className="chat-dot"/><div className="chat-dot"/></div></div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="chat-input-row">
                    <textarea className="chat-textarea" placeholder={AI_DEFAULT_COMMAND_GENERATOR_PROMPT} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }} disabled={chatLoading} rows={1} />
                    <button className="btn btn-cyan chat-send" onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()}>
                      {chatLoading ? <><span className="spinner" style={{width:12,height:12}} />...</> : "SEND"}
                    </button>
                  </div>
                </div>
                )
            )}
          </>
        )}
      </div>

      {/* Toast */}
      <div className={`tc-toast ${toast.vis ? "visible" : "hidden"} ${toast.type}`}>
        {toast.msg}
      </div>
    </div>
  );
}
