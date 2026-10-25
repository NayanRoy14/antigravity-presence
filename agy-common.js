// Antigravity's agent hooks and its editor extension both describe the same
// workspace, so they share one session file keyed by the workspace path.
const crypto = require('crypto');
const path = require('path');

// Accepts plain paths, "/d:/x" and "file:///d%3A/x" forms.
function normalize(ws) {
  let p = String(ws);
  if (p.startsWith('file://')) p = decodeURIComponent(p.slice(7));
  if (/^\/[a-z]:/i.test(p)) p = p.slice(1);
  return path.resolve(p).replace(/[\\/]+$/, '');
}

function workspaceId(ws) {
  let p = normalize(ws);
  if (process.platform === 'win32') p = p.toLowerCase();
  return 'ws-' + crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
}

module.exports = { workspaceId, normalize };
