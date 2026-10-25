#!/usr/bin/env node
// Installs (or removes) the Antigravity agent hooks that point at this folder.
// Usage: node setup.js [--uninstall]
// Other hooks are kept; a .bak copy is written before any change.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname.replace(/\\/g, '/');
const HOOKS = path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
const KEY = 'antigravity-presence';
const uninstall = process.argv.includes('--uninstall');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`${file} is not valid JSON (${e.message}); fix it first`);
  }
}

try {
  const hooks = readJson(HOOKS);
  const cmd = (event) => ({ type: 'command', command: `node "${ROOT}/hook.js" ${event}`, timeout: 5 });
  if (uninstall) delete hooks[KEY];
  else {
    hooks[KEY] = {
      PreInvocation: [cmd('PreInvocation')],
      PostToolUse: [{ matcher: '*', hooks: [cmd('PostToolUse')] }],
      Stop: [cmd('Stop')],
    };
  }
  fs.mkdirSync(path.dirname(HOOKS), { recursive: true });
  if (fs.existsSync(HOOKS)) fs.copyFileSync(HOOKS, `${HOOKS}.bak`);
  fs.writeFileSync(HOOKS, JSON.stringify(hooks, null, 2) + '\n');
  console.log(`${uninstall ? 'Removed' : 'Installed'} agent hooks in ${HOOKS}`);
  if (!uninstall) {
    console.log('\nNext: install extension/antigravity-presence.vsix in Antigravity and add this');
    console.log('to your Antigravity settings.json, then restart Antigravity:');
    console.log(`  "antigravityPresence.root": "${ROOT}"`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
