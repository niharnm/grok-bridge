# Grok Bridge

**Grok Bot ↔ Codex, Claude Code, Cursor, and Antigravity. One CLI.**

[![CI](https://github.com/niharnm/grok-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/niharnm/grok-bridge/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node-%E2%89%A522-43853d.svg)](package.json)

[Website](https://niharnm.github.io/grok-bridge/) · [Shared skill install](docs/skill-indexes.md) · [Release](https://github.com/niharnm/grok-bridge/releases/tag/v0.1.0-alpha.1)

Hand a bounded task to another tool, get a result, and continue where you started. Grok Bridge packages a small shared runner, Codex, Claude Code, and Cursor plugins plus Antigravity skills, and a Grok Bot setup workflow. No runtime npm dependencies, separate bridge account, or custom remote-command server.

**Experimental alpha.** Three directions have live evidence: Codex to Grok Bot, Grok Bot to Codex, and Grok Bot to Antigravity. Native Codex and Antigravity reads and edits also passed. Claude provider access, Cursor login, Antigravity source-host command permissions, and actual host skill discovery still limit acceptance. See the [acceptance record](docs/acceptance.md).

| From | To | How |
| --- | --- | --- |
| Codex | Grok Bot | `forward` skill calls the shared CLI and community `gbot` |
| Claude Code | Grok Bot | The same `forward` skill and CLI |
| Grok Bot | Codex | Bot uses approved local execution to call `run --to codex` |
| Grok Bot | Claude Code | Bot uses approved local execution to call `run --to claude` |
| Cursor | Grok Bot | The shared `forward` skill and CLI |
| Grok Bot | Cursor | Bot calls `run --to cursor` through approved execution |
| Antigravity | Grok Bot | Its `grok-bridge` skill calls the shared CLI |
| Grok Bot | Antigravity | Bot calls `run --to antigravity` through approved execution |

Grok Bot's cloud computer is separate from your laptop. The reverse routes use its native local execution when available and approved. Running on the cloud computer instead requires the CLI, login, and repository on that computer. This project does not change that policy or copy your credentials.

## Start with one task

Install [Node.js 22 or newer](https://nodejs.org/en/download), then install from this repository:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
grok-bridge doctor
```

This is a GitHub install, not an npm registry release. `doctor` checks executable availability only. Each destination needs its own working login. Existing account plans and usage limits apply.

To reach Grok Bot, also install the separately maintained client and sign in to the Grok Bot desktop app:

```sh
npm install -g grok-bot-cli@0.2.3
gbot --gateway --json bots list
```

Choose an individual Bot UUID. Put one objective, relevant context, permitted actions, and expected output into `task.txt`, then:

```sh
grok-bridge send --agent BOT_UUID --task-file task.txt --wait --timeout 600
```

The forward adapter uses the community [grok-bot-cli](https://github.com/ScriptedAlchemy/grok-bot-cli), which accesses private gateway endpoints using the app's session. It is **not an official xAI Bot API**. An xAI inference API key is not interchangeable with a Bot login.

For an authenticated coding CLI on the current computer:

```sh
grok-bridge run --to codex --cwd /absolute/repo --mode review --task-file task.txt
grok-bridge run --to claude --cwd /absolute/repo --mode work --task-file task.txt
grok-bridge run --to cursor --cwd /absolute/repo --mode review --task-file task.txt
grok-bridge run --to antigravity --cwd /absolute/repo --mode review --task-file task.txt
```

`review` is the default. `work` explicitly permits edits within the task's scope. Supply `--model` only to select a particular destination model; otherwise its configured default applies. To continue a returned native session, use `--session SESSION_UUID` with the same target and repository. Nothing silently selects the most recent session.

## Install the host plugins

For a single shared Agent Skill across Codex, Claude Code, Cursor, and Antigravity, use the [Skills CLI installation](docs/skill-indexes.md). The canonical `skills/grok-bridge` entrypoint teaches the same CLI. Choose the shared skill or the host plugin for a given project.

For **Claude Code**, run in its interactive prompt:

```text
/plugin marketplace add niharnm/grok-bridge@v0.1.0-alpha.1
/plugin install grok-bridge@grok-bridge
```

Use `/grok-bridge:forward` to delegate to a chosen Grok Bot. `/grok-bridge:run` delegates to an installed coding CLI. Install the shared executable separately using the command above, since plugin caches do not contain the runner.

For **Codex**, add the repository marketplace:

```sh
codex plugin marketplace add niharnm/grok-bridge --ref v0.1.0-alpha.1
```

Install Grok Bridge from the plugin browser and start a new session. Ask it to use the `forward` skill with a specific Bot and task. The repository includes the supported `.codex-plugin` compatibility manifest and `.agents/plugins/marketplace.json`.

For **Cursor**, follow the [native plugin setup](docs/cursor-setup.md). The official `agent` CLI is the reverse destination. Cursor IDE access is not inferred from the Grok gateway.

For **Antigravity**, follow the [CLI and skill setup](docs/antigravity-setup.md). It uses the actual `agy` CLI, not the separate Gemini CLI.

For **Grok Bot**, follow the [setup guide](docs/grok-bot-setup.md), verify a small local execution, then save the documented workflow as a Bot skill. Grok Bot and Grok Build are different products; this is not a `.grok` filesystem installer.

## Submission, completion, and cancellation

Without `--wait`, `send` returns immediately after acknowledgement:

```json
{"status":"submitted","provider":"grok","requestId":"...","agent":"..."}
```

Continue waiting without submitting again:

```sh
grok-bridge wait --agent BOT_UUID --request REQUEST_UUID --timeout 600
grok-bridge thread --agent BOT_UUID
```

Waiting requires an exact final marker from a recognized Bot message correlated to the submitted request. A greeting, progress update, user echo, or silent transcript cannot complete a wait. `completed` means the destination returned its final answer; verify the work itself before accepting it.

- A cloud timeout or Ctrl-C ends local waiting. **It does not cancel the Bot.**
- An uncertain send is never retried automatically. Inspect the conversation first.
- `wait` reads the latest 200 entries. If the request has fallen outside that window, it cannot establish completion.
- Unknown gateway response formats fail explicitly. Provider changes can break this experimental adapter.
- Local commands have a deadline, an 8 MiB combined output limit, and process-group cleanup on macOS/Linux. Detached descendants and Windows process cleanup have separate limits.

Use `--task-file -` to pipe a task through stdin. Tasks are limited to 64 KiB. The bridge emits JSON to stdout; `send --wait` emits its submission receipt to stderr so the request ID survives a later timeout. Exit codes are `0` for a successful command, `1` for failure, `2` for a reported blocker, and `130` for interruption.

## Permissions and data

Codex uses its native read-only or workspace-write sandbox with noninteractive approvals disabled. Claude review exposes Read, Glob, and Grep; work also exposes Edit, Write, and Bash with `acceptEdits`. Claude child MCP servers, skills, and browser integration are disabled. Native user/project settings and hooks can still apply, so review mode is not a standalone operating-system sandbox for Claude.

Cursor review uses Ask mode with its sandbox enabled. Cursor work adds `--force`, which automatically allows commands unless explicitly denied; its sandbox remains enabled. Antigravity review requests plan mode, which is not a hard read-only boundary. Antigravity work requests `accept-edits`, with its sandbox enabled and without bypassing permissions. Neither adapter changes workspace trust or account policy.

The bridge stores no credentials or transcripts. Destination applications retain their own sessions. Task files and command output remain under your control. The `gbot` and Cursor CLIs receive prompts as command arguments, so those prompts can be visible to local process inspection. Codex, Claude, and Antigravity receive task content through stdin. Send only the context the task needs. See [security and data boundaries](SECURITY.md).

The local child receives `GROK_BRIDGE_CHILD=1`; recursive bridge calls fail. Host skills and Grok prompts also instruct children to return once without reciprocal loops. Prompt instructions are not a security boundary against a deliberately disobedient destination.

## Development and evidence

```sh
git clone --branch v0.1.0-alpha.1 https://github.com/niharnm/grok-bridge.git
cd grok-bridge
npm run check
npm test
npm pack --dry-run
```

There is no compilation step or runtime dependency install. CI exercises Node.js 22 and 24 on macOS and Linux. Windows execution and forward desktop-session authentication are not release-verified.

The design was informed by OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc). That plugin has a richer Codex app-server broker and native transcript transfer. This independent implementation uses bounded CLI calls and explicit task context; it does not import complete chat histories. Read the [source study and design decisions](docs/architecture.md), [acceptance record](docs/acceptance.md), and [contribution guide](CONTRIBUTING.md).

Independent community project. No affiliation with or endorsement by OpenAI, Anthropic, xAI, Cursor, or Google is claimed.
