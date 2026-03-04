import { useState, useEffect, useRef } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "");

const ICONS = ["⚡","🔧","📂","🎵","🖥️","🔊","💡","🌐","📧","🚀","🎮","🔒","📸","🖨️","♻️"];
function cmdIcon(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return ICONS[h % ICONS.length];
}

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

// ── TRIGGERcmd API (via Vite proxy) ────────────────────────────────────────
async function fetchCommands(token) {
  const res = await fetch("/api/command/list", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.records || data;
}

async function triggerCommand(token, computer, command, params) {
  const body = { computer, command };
  if (params) body.params = params;

  const res = await fetch("/api/run/trigger", {
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
.tc-sidebar::-webkit-scrollbar { width:4px; }
.tc-sidebar::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
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
.cmds-list::-webkit-scrollbar { height:4px; }
.cmds-list::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }

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
`;

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
  const [executed, setExecuted] = useState(0);
  const [log, setLog] = useState([{ time: "--:--:--", msg: "System initialized. Awaiting commands.", type: "info" }]);
  const [toast, setToast] = useState({ msg: "", type: "info", vis: false });
  const [clock, setClock] = useState("");
  const toastTimer = useRef(null);

  // inject CSS once
  useEffect(() => {
    const id = "tc-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id; el.textContent = CSS;
      document.head.appendChild(el);
    }
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
      const cmds = await fetchCommands(tok);
      const groups = {};
      cmds.forEach((c) => {
        const name = c.computer?.name || "Unknown";
        (groups[name] = groups[name] || []).push(c);
      });
      setToken(tok);
      setAllCmds(cmds);
      setComputers(groups);
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
      const cmds = await fetchCommands(tok);
      const groups = {};
      cmds.forEach((c) => {
        const name = c.computer?.name || "Unknown";
        (groups[name] = groups[name] || []).push(c);
      });
      setToken(tok);
      localStorage.setItem("tc-token", tok);
      setAllCmds(cmds);
      setComputers(groups);
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

  return (
    <div className="tc-root">
      <div className="tc-inner">
        {/* Header */}
        <div className="tc-header">
          <div className="tc-logo">
            <div className="tc-logo-icon">⚡</div>
            <div>
              <h1>TRIGGERCMD</h1>
              <span>MISSION CONTROL // v2.0</span>
            </div>
          </div>
          <div className="tc-status">
            <div className={`tc-dot ${phase === "dashboard" ? "on" : ""}`} />
            <span>{phase === "dashboard" ? "CONNECTED" : "OFFLINE"}</span>
            <span style={{ color: "var(--border)", margin: "0 10px" }}>|</span>
            <span>{clock}</span>
            {phase === "dashboard" && (
              <button className="disconnect-btn" onClick={() => { localStorage.removeItem("tc-token"); setPhase("setup"); setToken(""); setAllCmds([]); setComputers({}); setSelected(null); }}>
                DISCONNECT
              </button>
            )}
          </div>
        </div>

        {/* Setup */}
        {(phase === "setup" || phase === "loading") && (
          <div className="tc-setup">
            <h2>⚡ INITIALIZE CONNECTION</h2>
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
                          <div className="cmd-icon-box">{cmdIcon(cmd.name)}</div>
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
                            {hasParams && <span className="badge-params">PARAMS</span>}
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
