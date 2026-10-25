#!/usr/bin/env node
// Antigravity agent hook (~/.gemini/config/hooks.json, installed by setup.js). Called with the event
// name as argv[2] because the payload doesn't carry it. Antigravity runs hooks
// synchronously and expects a JSON object on stdout, so always print "{}".
const { readSession, writeSession, ensureDaemon } = require('./session');
const { workspaceId, normalize } = require('./agy-common');

// Tool names are lowercased Cortex step types, e.g. run_command, view_file.
const TOOL_NAMES = [
  [/run_command|send_command|command_status/, 'Running commands'],
  [/write_to_file|replace_file_content|multi_replace|edit|propose_code/, 'Editing files'],
  [/view_file|view_code|read_url|list_dir|read_resource/, 'Reading files'],
  [/grep|find_by_name|codebase_search|search/, 'Searching the codebase'],
  [/browser/, 'Using the browser'],
  [/mcp/, 'Using MCP tools'],
];

function toolLabel(name) {
  if (!name) return '';
  for (const [re, label] of TOOL_NAMES) if (re.test(name)) return label;
  return `Using ${name.replace(/_/g, ' ')}`;
}

function main(event, raw) {
  let ev = {};
  try { ev = JSON.parse(raw.replace(/^﻿/, '') || '{}'); } catch {}
  const ws = (ev.workspacePaths || [])[0];
  if (!ws) return;
  const id = workspaceId(ws);
  const s = readSession(id) || {};
  const now = Date.now();
  s.startedAt = s.startedAt || now;
  s.updatedAt = now;
  s.cwd = s.cwd || normalize(ws);
  if (ev.modelName && ev.modelName !== 'auto') s.model = ev.modelName;

  switch (event) {
    case 'PreInvocation':
      s.status = 'thinking';
      s.agentAt = now;
      break;
    case 'PostToolUse': {
      s.status = 'working';
      s.agentAt = now;
      const name = ev.toolCall?.name || ev.toolName || '';
      if (name) s.tool = toolLabel(name);
      break;
    }
    case 'Stop':
      s.status = 'idle';
      s.agentAt = 0;
      s.tool = '';
      break;
  }
  writeSession(id, s);
  ensureDaemon();
}

const event = process.argv[2];
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try { main(event, raw); } catch {}
  process.stdout.write('{}');
  process.exit(0);
});
