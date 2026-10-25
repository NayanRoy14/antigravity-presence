// Editor side of antigravity-presence: reports the open workspace, active file,
// whether you're editing, and keeps daily stats (active time, lines typed by you
// vs. the agent, time per language). The agent side comes from hook.js; both
// write the same session file, which daemon.js shows.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const EDITING_FOR = 2 * 60000; // "Editing" this long after the last keystroke
const ACTIVE_FOR = 2 * 60000; // counts as active time this long after any activity
const IDLE_AFTER = 5 * 60000; // no editor activity -> idle
const AGENT_FRESH = 5 * 60000; // trust the agent hook's status this long
const TICK = 30000;

const LANGS = {
  typescript: 'TypeScript', typescriptreact: 'TypeScript', javascript: 'JavaScript',
  javascriptreact: 'JavaScript', python: 'Python', go: 'Go', rust: 'Rust', java: 'Java',
  c: 'C', cpp: 'C++', csharp: 'C#', ruby: 'Ruby', php: 'PHP', html: 'HTML', css: 'CSS',
  scss: 'SCSS', json: 'JSON', jsonc: 'JSON', markdown: 'Markdown', yaml: 'YAML', shellscript: 'Shell',
  powershell: 'PowerShell', sql: 'SQL', vue: 'Vue', svelte: 'Svelte', dart: 'Dart', kotlin: 'Kotlin',
  swift: 'Swift', lua: 'Lua', plaintext: 'Plain Text',
};

let lib, id, ws, statsFile, timer, debounce;
const state = { file: '', lang: '', activeAt: Date.now(), editAt: 0, lastTick: Date.now(), agentBusy: false };
const session = { added: 0, agentAdded: 0 };
const pending = { ms: 0, added: 0, agentAdded: 0, langs: {} }; // not yet saved to the stats file

function prettyLang(langId) {
  return LANGS[langId] || (langId ? langId[0].toUpperCase() + langId.slice(1) : '');
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function onEditor(ed) {
  const doc = ed && ed.document;
  if (doc && doc.uri.scheme !== 'file') return; // ignore output panels, diff views, etc.
  state.file = doc ? path.basename(doc.fileName) : '';
  state.lang = doc ? prettyLang(doc.languageId) : '';
  state.activeAt = Date.now();
  schedule();
}

function onChange(e) {
  if (e.document.uri.scheme !== 'file' || !e.contentChanges.length) return;
  let added = 0;
  for (const c of e.contentChanges) {
    const newLines = c.text.split('\n').length - 1;
    const oldLines = c.range.end.line - c.range.start.line;
    added += Math.max(0, newLines - oldLines);
  }
  const active = vscode.window.activeTextEditor;
  const mine = active && active.document === e.document && !state.agentBusy;
  if (mine) {
    session.added += added;
    pending.added += added;
    state.editAt = state.activeAt = Date.now();
    schedule();
  } else {
    // Background files, or anything changed while the agent is running.
    session.agentAdded += added;
    pending.agentAdded += added;
  }
}

function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(flush, 1500);
}

// Count time since the last tick if you (or the agent) were active.
function tick(now) {
  const dt = Math.min(now - state.lastTick, TICK + 5000);
  state.lastTick = now;
  if (dt <= 0 || (now - state.activeAt > ACTIVE_FOR && !state.agentBusy)) return;
  pending.ms += dt;
  if (state.lang) pending.langs[state.lang] = (pending.langs[state.lang] || 0) + dt;
}

function saveStats(now) {
  if (!pending.ms && !pending.added && !pending.agentAdded) return;
  let stats = { days: {} };
  try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch {}
  const day = (stats.days[dayKey(now)] = stats.days[dayKey(now)] || { ms: 0, added: 0, agentAdded: 0, langs: {} });
  day.ms += pending.ms;
  day.added += pending.added;
  day.agentAdded += pending.agentAdded;
  for (const [l, ms] of Object.entries(pending.langs)) day.langs[l] = (day.langs[l] || 0) + ms;
  // Keep 60 days.
  for (const k of Object.keys(stats.days).sort().slice(0, -60)) delete stats.days[k];
  fs.mkdirSync(path.dirname(statsFile), { recursive: true });
  const tmp = `${statsFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stats));
  fs.renameSync(tmp, statsFile);
  Object.assign(pending, { ms: 0, added: 0, agentAdded: 0, langs: {} });
}

function flush() {
  try {
    const now = Date.now();
    const s = lib.session.readSession(id) || {};
    state.agentBusy = (s.status === 'thinking' || s.status === 'working') && now - (s.agentAt || 0) < AGENT_FRESH;
    tick(now);
    s.startedAt = s.startedAt || now;
    s.updatedAt = now;
    s.cwd = ws;
    s.file = state.file;
    s.lang = state.lang;
    s.lastActive = state.activeAt; // daemon uses it to pick which tool to show
    s.sessionAdded = session.added;
    s.agentAdded = session.agentAdded;
    if (!state.agentBusy) {
      s.status = now - state.editAt < EDITING_FOR ? 'editing' : now - state.activeAt < IDLE_AFTER ? 'viewing' : 'idle';
    }
    lib.session.writeSession(id, s);
    saveStats(now);
    lib.session.ensureDaemon();
  } catch (e) {
    console.error('[antigravity-presence]', e);
  }
}

function activate(context) {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder || folder.uri.scheme !== 'file') return; // nothing to show without a local folder
  const root = vscode.workspace.getConfiguration('antigravityPresence').get('root');
  if (!root || !fs.existsSync(path.join(root, 'session.js'))) {
    vscode.window.showWarningMessage('Antigravity Presence: set "antigravityPresence.root" in settings to the folder you cloned antigravity-presence into, then reload.');
    return;
  }
  lib = { session: require(path.join(root, 'session.js')), common: require(path.join(root, 'agy-common.js')) };
  ws = folder.uri.fsPath;
  id = lib.common.workspaceId(ws);
  statsFile = path.join(lib.session.stateDir(), 'stats', `${id}.json`);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(onEditor),
    vscode.workspace.onDidChangeTextDocument(onChange),
    vscode.window.onDidChangeWindowState((w) => {
      if (w.focused) {
        state.activeAt = Date.now();
        schedule();
      }
    }),
  );
  timer = setInterval(flush, TICK); // active time, keeps the session fresh, flips to idle
  onEditor(vscode.window.activeTextEditor);
}

function deactivate() {
  clearInterval(timer);
  clearTimeout(debounce);
  if (!lib || !id) return;
  try {
    tick(Date.now());
    saveStats(Date.now());
  } catch {}
  lib.session.removeSession(id);
}

module.exports = { activate, deactivate };
