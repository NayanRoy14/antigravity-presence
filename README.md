# Antigravity Presence

Discord Rich Presence for **Google Antigravity**. It shows what you and the agent are doing (editing a file, agent thinking, running commands, idle) with animated status GIFs and stats like today's hours, top language and lines written by you vs. the agent.

- No dependencies: plain Node.js, nothing to `npm install`
- Runs locally: talks to the Discord desktop app over its local IPC pipe, and the only network call is an optional GitHub lookup for the repo button
- Starts itself when you open Antigravity and exits when you're done

| status | example (lines rotate) |
| --- | --- |
| editing | Editing solver.py · Caltech · Python / +42 lines this session · 1h 35m today |
| viewing | Viewing solver.py · Caltech · Python / Working in Caltech · 1h 35m today |
| thinking | Agent thinking in Caltech · Gemini 3 Pro / +1.3k lines by agent this session |
| working | Agent working in Caltech · Running commands |
| idle | Idle in Caltech · 1h 35m today / This week · 5h 35m · TypeScript |

> Also using Claude Code? [disclaude](https://github.com/NayanRoy14/disclaude) does both tools and takes turns between them. Use one or the other, not both.

---

## Requirements

- **Node.js 18+** on your `PATH` (check with `node --version` in a new terminal)
- **Discord desktop app** running on the same machine (the browser version can't show Rich Presence)
- In Discord: **User Settings → Activity Privacy → "Share your detected activities with others"** turned on
- **Antigravity**, on Windows, macOS or Linux

## Setup

There are two parts that work together:

- **Agent hooks** report what the agent does (thinking, running tools, done).
- **The editor extension** reports the open file, language, whether you're typing, and keeps daily stats.

### 1. Get the code

Clone it somewhere permanent. The hooks and extension point at this folder, so don't move it later (if you do, run steps 2 and 3 again).

```bash
git clone https://github.com/NayanRoy14/antigravity-presence.git
cd antigravity-presence
```

### 2. Install the agent hooks

```bash
node setup.js
```

This adds an `antigravity-presence` entry to `~/.gemini/config/hooks.json`. Your other hooks stay as they are, and a `.bak` copy is saved first. It also prints the line you need for step 3.

### 3. Install the editor extension

1. In Antigravity open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **Extensions: Install from VSIX…** → pick `extension/antigravity-presence.vsix` from this folder.
2. Command Palette → **Preferences: Open User Settings (JSON)** and add the folder you cloned into (use forward slashes):
   ```json
   "antigravityPresence.root": "C:/Users/you/antigravity-presence"
   ```
3. Restart Antigravity.

If the path is missing or wrong, the extension shows a warning on startup telling you to set it.

### 4. Check it

Open a folder in Antigravity and click into a file. Within a few seconds your Discord profile should show **Playing Antigravity**. To check from a terminal:

```bash
node cli.js status
```

```
paused: no
daemon: running (pid 12345)
  workspace: myapp - editing (index.ts)
  last log: [2026-10-25T14:20:01.000Z] presence: Editing index.ts | myapp · TypeScript
```

## Daily use

```bash
node cli.js pause 30m   # hide presence for 30 minutes (or 2h; default 1h)
node cli.js resume      # show it again
node cli.js status      # daemon, workspaces, last log line
```

With several Antigravity windows open, the busiest one is shown with a `(+N)` count.

## Statuses

| status | source | when |
| --- | --- | --- |
| thinking | agent hook (PreInvocation) | the agent starts working on your prompt |
| working | agent hook (PostToolUse) | the agent is running tools (commands, edits, search, browser…) |
| editing | extension | you typed in the last 2 minutes |
| viewing | extension | Antigravity is open and active |
| idle | extension or agent Stop | 5 minutes with no activity, or the agent finished |

There's no PreToolUse hook on purpose: Antigravity expects that hook to return allow/ask/deny, which would change your permission prompts.

The extension keeps per-day stats in `.state/stats/`: active time, lines typed by you vs. lines changed while the agent works, and time per language. It keeps 60 days.

## Customizing

Edit `config.json`. Changes apply the next time the daemon starts (it exits about a minute after you close Antigravity).

| key | what it does |
| --- | --- |
| `frames` | Per-status lists of `[top line, bottom line]` templates. Several frames rotate. `{vars}` that come out empty drop their ` · ` segment, and a frame whose line ends up empty is skipped. |
| `images` | Per-status Discord asset key or `https://` URL. GIFs animate. |
| `projects` | Rename or hide folders: `{ "secret-client": "hidden", "myapp": "My App" }` |
| `githubButton` | Adds a "View on GitHub" button when the project is a **public** GitHub repo |
| `rotateSeconds` | How often frames rotate |
| `hideAfterIdleMinutes` | Clear presence after being idle this long (`0` = never) |
| `staleMinutes` | Forget a workspace with no activity for this long |
| `exitAfterIdleSeconds` | How long the daemon waits with no workspaces before exiting |
| `clientId` | Discord application ID (see below) |

**Template variables:** `{project} {file} {lang} {model} {tool} {sessionAdded} {agentAdded} {todayHours} {weekHours} {weekAdded} {weekAgentAdded} {topLang}`.

### Using your own Discord app (optional)

The bundled `clientId` works for everyone and shows as "Playing **Antigravity**". To change the name or upload your own art:

1. Create an application at <https://discord.com/developers/applications>. Its name is the "Playing …" text.
2. Copy the **Application ID** into `clientId`.
3. Optionally upload images under **Rich Presence → Art Assets** and use their keys in `images`, or use any public `https://` image/GIF URL.

### Status GIFs

`assets/anim/anim.html` draws each frame and `python assets/anim/build.py` renders them to GIFs (needs headless Chrome and Pillow). Discord only animates images from a public URL, so the defaults are hosted at [NayanRoy14/vibing](https://github.com/NayanRoy14/vibing).

## How it works

```
Antigravity agent ──► hook.js ──────┐
                                    ├─► .state/sessions/<workspace>.json ─► daemon.js ─► Discord IPC
Antigravity editor ─► extension ────┘
```

| file | role |
| --- | --- |
| `hook.js` | Agent hook: thinking / working / stop, then starts the daemon if needed |
| `extension/` | Editor extension: workspace, file, language, editing/idle, daily stats. `python extension/pack.py` rebuilds the `.vsix`. |
| `session.js` | Atomic session-file writes and daemon start-up, shared by the hook and the extension |
| `agy-common.js` | Maps a workspace path to the session ID both sides share |
| `daemon.js` | Connects to Discord, picks the busiest workspace, renders frames, exits when nothing is left |
| `cli.js` | pause / resume / status |
| `setup.js` | Installs or removes the agent hooks |

Everything it writes stays in `.state/` inside this folder (sessions, stats, log). It's git-ignored.

## Troubleshooting

| problem | fix |
| --- | --- |
| Nothing shows on Discord | Use the Discord **desktop** app, turn on Activity Privacy → share activity, and restart Discord if it was closed. Check `.state/daemon.log`. |
| "Set antigravityPresence.root" warning | Add the setting from step 3 with the folder you cloned into, then restart Antigravity. |
| File/editing shows but never "Agent thinking" | The hooks aren't loaded: run `node setup.js` again and restart Antigravity. Make sure `node` works in a new terminal. |
| Agent status shows but no file name | The extension isn't installed or the root setting is wrong. Check Help → Toggle Developer Tools → Console for `[antigravity-presence]`. |
| `status` says "not running" | The daemon only runs while a workspace is open; click into a file first. Run `node daemon.js` by hand to see errors. |
| Wrong project name | Add it to `projects` in `config.json`. |
| Moved the folder | Run `node setup.js` again and update `antigravityPresence.root`. |

## Uninstall

```bash
node setup.js --uninstall
```

Then uninstall "Antigravity Presence" from the Extensions view in Antigravity and delete the folder.

## License

MIT, see [LICENSE](LICENSE). Inspired by [claude-rpc](https://github.com/rar-file/claude-rpc) (MIT).
