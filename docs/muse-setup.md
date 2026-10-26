# Set up Muse Code

Muse Code is Meta's terminal coding agent. Its executable is `muse`. Muse Code can send a bounded task to Grok Bot through the shared bridge. Grok Bot can call `muse exec` through approved execution on the computer holding the repository.

This route targets the Muse Code CLI. It does not drive the separate Muse desktop or web app, which has no documented way to run a local command or install a custom skill.

The adapter follows the `muse exec --help` output of Muse Code 1.4.12 and Meta's current [Muse Code documentation](https://dev.meta.ai/docs/muse-code). Meta does not publish a schema for the `--json` event stream. The parser is built from captured 1.4.x output and fails closed on anything it does not recognize as a finished run. See the current [acceptance record](acceptance.md).

## Install

Install Node.js 22 or newer, then the runtime:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.2
```

Install [Muse Code](https://dev.meta.ai/docs/muse-code) on the computer that will run the task, using Meta's installer. Sign in once interactively with `muse login`. Headless runs use that stored login. The bridge never reads or copies Muse credentials.

```sh
muse --version
grok-bridge doctor --to muse
```

If `muse` is outside PATH, set `GROK_BRIDGE_MUSE_BIN` to its absolute executable path. `doctor` checks executable availability, not authentication or model access.

## Install the host skill

Copy `integrations/muse/grok-bridge/SKILL.md` to one of the skill locations Muse Code reads:

| Scope     | Copy the source file to                       |
| --------- | --------------------------------------------- |
| Project   | `<repository>/.agents/skills/grok-bridge/SKILL.md` |
| User      | `~/.agents/skills/grok-bridge/SKILL.md`        |

Project skills load only after you trust the workspace in Muse Code. If you already installed the shared `skills/grok-bridge` skill under `.agents/skills` for Codex, Cursor, or Antigravity, Muse Code reads that same folder. Keep one copy. `muse skills list` shows what Muse Code actually discovered.

## Muse Code to Grok Bot

Install the separately maintained client and finish the Grok Bot desktop login:

```sh
npm install -g grok-bot-cli@0.2.3
grok-bridge doctor --to grok
```

Follow [Grok Bot setup](grok-bot-setup.md), choose an individual Bot UUID, then ask the Muse Code skill to submit one bounded task:

```sh
grok-bridge send --agent BOT_UUID --task-file /absolute/task.txt --wait --timeout 600
```

Running the bridge is a shell command inside Muse Code. Muse Code's approval policy and sandbox decide whether it may run. The default `proxy-only` sandbox network asks for each outbound destination, so the first send may stop for your approval. Approve it in Muse Code. Do not switch to `--yolo` or disable the sandbox to get past a prompt.

## Grok Bot to Muse Code

The Bot must use its approved native execution on the chosen computer. Its cloud terminal cannot reach a laptop repository by naming its path. Give it the exact computer, repository, branch, allowed files, and objective. Have it create the task file there and run:

```sh
grok-bridge run --to muse --cwd /absolute/repository --mode review --task-file /absolute/task.txt --timeout 600
```

The bridge writes the task to a private temporary file and passes it with `--prompt-file`, so the task text does not appear in process listings. The file is deleted when the run ends.

| Mode     | Native flags                                                     | Effect                                                                 |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `review` | `--disable-write --disable-shell`                                | Native file tools cannot write and workspace shell execution is off    |
| `work`   | neither flag                                                     | Edits and shell commands run inside Muse Code's OS sandbox             |
| both     | `--approval-mode never --sandbox-network proxy-only`             | No approval prompts; the OS sandbox stays on                           |
| both     | `--contributor-mode off --no-foreign-personal-context`           | No contributor uploads; other agents' personal rules and skills stay out |
| both     | `--disable-request-user-input --disable-web-tools`               | The run cannot stall on a question and makes no web tool calls         |

The bridge also sets `MUSE_NO_AUTO_UPDATE=1` so the launcher does not swap builds mid-run, and `MUSE_LOGIN=0` so a missing login fails instead of opening an interactive sign-in.

The bridge never adds `--yolo`, `--disable-sandbox`, `--disable-approval`, or `--trust-workspace`. Without workspace trust, Muse Code does not load that repository's project skills, rules, or hooks for the run. Muse's [permission docs](https://dev.meta.ai/docs/muse-code/permissions) describe `never` as "nothing stops for approval. The sandbox alone contains what runs." On macOS the sandbox is Seatbelt; on Linux it is bubblewrap. It grants writes to the workspace and a temporary directory, keeps `.git`, `.muse`, and `.agents` read-only, and refuses shell commands when it cannot confirm the sandbox is active.

To continue, pass the returned session UUID explicitly:

```sh
grok-bridge run --to muse --cwd /absolute/repository --mode review --session SESSION_UUID --task-file /absolute/follow-up.txt
```

Muse Code refuses to continue a session in a different workspace. The bridge does not pass `--allow-workspace-switch`.

## How results are read

`muse exec --json` writes one event envelope per line. The bridge takes the session UUID from the `session` stream, collects `run.output.delta` text, and requires exactly one `run.terminal.*` event. Only `run.terminal.completed` with nonempty text counts as `completed`. Any other terminal kind, such as failed or cancelled, is a failure. Unknown event types are ignored, so newer Muse builds keep working, but a missing or duplicate terminal event, an unrelated session, or a malformed envelope fails explicitly.

If the stream shows Muse Code waiting on a tool approval, the bridge returns `blocked`, even when the run later completes. Check the destination session and the actual diff before accepting the work. Exit code 0 from Muse Code means the run ended, not that the work is correct.

## Record live acceptance

For each route, record the real host, Muse Code version, bounded task, session UUID or Bot request ID, and the independently checked result. Offline fixtures and a replayed capture do not establish a live route.
