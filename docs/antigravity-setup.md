# Set up Antigravity

Antigravity can send a bounded task to Grok Bot through the shared bridge. Grok Bot can call the real Antigravity CLI, `agy`, through approved execution on the computer holding the repository. This integration does not substitute the separate Gemini CLI or treat opening an editor as a completed task.

The adapter follows Antigravity CLI 1.2.0 help and Google's current protocol documentation. CLI availability, protocol tests, skill discovery, and authenticated route acceptance are separate checks. See the current [acceptance record](acceptance.md).

## Install the pinned alpha

Install Node.js 22 or newer, then install the tagged runtime and clone the same tag for the skill:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
git clone --branch v0.1.0-alpha.1 --depth 1 https://github.com/niharnm/grok-bridge.git grok-bridge-alpha
```

This installs from GitHub, not the npm registry. Use the tag, since the repository's default branch may differ from the alpha implementation.

Install and authenticate [Google's Antigravity CLI](https://antigravity.google/docs/cli/install/) on the computer that will run the task. Complete the first login interactively with `agy`; headless execution uses the cached login. Keep authentication on that computer. The bridge does not copy credentials or change providers.

```sh
agy --version
grok-bridge doctor --to antigravity
```

If `agy` is outside PATH, set `GROK_BRIDGE_ANTIGRAVITY_BIN` to its absolute executable path. `doctor` checks executable availability, not authentication or model access.

## Install the host skill

The tagged source is `integrations/antigravity/grok-bridge/SKILL.md`. It calls the separately installed shared executable. It is a dedicated Antigravity skill, not a marketplace listing or a plugin copied from another host.

Choose the layout documented for your host and workspace:

| Host            | Copy the source file to                            |
| --------------- | -------------------------------------------------- |
| Antigravity CLI | `<repository>/.agents/skills/grok-bridge.md`       |
| Antigravity 2.0 | `<repository>/.agents/skills/grok-bridge/SKILL.md` |

The [CLI skill guide](https://antigravity.google/docs/cli/plugins/#creating-local-workspace-skills) documents a flat Markdown file. The [Antigravity 2.0 skill guide](https://antigravity.google/docs/skills/) documents a folder containing `SKILL.md`, with `~/.gemini/config/skills/` as its optional global root. These pages describe different layouts; do not assume successful loading in one host establishes loading in the other. Install one layout per workspace to avoid duplicate definitions, preserve existing files, restart that host, and confirm the `grok-bridge` skill is discoverable before sending a task.

## Antigravity to Grok Bot

Install the separately maintained client and finish the Grok Bot desktop login:

```sh
npm install -g grok-bot-cli@0.2.3
grok-bridge doctor --to grok
```

The client uses private gateway endpoints, not an official xAI Bot API. Its desktop-session support in this version is macOS and Linux. Follow [Grok Bot setup](grok-bot-setup.md), choose an individual Bot UUID, then ask the Antigravity skill to submit one bounded task. Its command is:

```sh
grok-bridge send --agent BOT_UUID --task-file /absolute/task.txt --wait --timeout 600
```

An acknowledgement means submitted. Completion requires a correlated Bot reply with the expected final marker. A timeout stops local waiting without cancelling the Bot. Retain the request ID and inspect the answer before continuing.

## Grok Bot to Antigravity

The Bot must use its approved native execution on the chosen computer. Its cloud terminal cannot access a laptop repository by naming its path. Give it the exact computer, repository, branch, allowed files, and objective. Have it create the task file there and invoke:

```sh
grok-bridge run --to antigravity --cwd /absolute/repository --mode review --task-file /absolute/task.txt --timeout 600
```

Review requests `--mode plan`; work requests `--mode accept-edits`. Google's [mode documentation](https://antigravity.google/docs/cli/modes/) describes plan as an instruction prefix, so **review is a requested behavior under native permissions, not an enforced filesystem write lock**. Work permits file edits within the requested scope. Both modes enable `--sandbox` and disable slash commands. The [terminal sandbox](https://antigravity.google/docs/cli/sandbox/) still permits workspace writes.

The bridge does not add `--dangerously-skip-permissions` or alter native settings. Existing [permission rules](https://antigravity.google/docs/cli/permissions/), hooks, and configured tools still matter. Antigravity custom agents have a documented [tool allowlist](https://antigravity.google/docs/subagents/#frontmatter-configuration-yaml), but this alpha does not install or select a custom agent. It makes no additional read-only enforcement claim.

To continue, provide the returned conversation UUID explicitly:

```sh
grok-bridge run --to antigravity --cwd /absolute/repository --mode review --session CONVERSATION_UUID --task-file /absolute/follow-up.txt
```

The adapter sends one NDJSON user event on stdin and closes stdin. It requires one matching terminal response and retains `conversation_id` as `session`. It rejects malformed, duplicate, unrelated, unfinished, and failed results. The provider's timeout and the bridge's process deadline both apply. See Google's [headless protocol](https://antigravity.google/docs/cli/headless/).

## Check the work and permission limits

Antigravity can soft-deny a tool, emit a notice to stderr, and still return `SUCCESS` with exit code zero. Its stream documents tool failures as `step_update.tool_info.error`, without a stable permission-denial code list. [Headless permissions and tool events](https://antigravity.google/docs/cli/headless/)

The live macOS source-host test on September 13, 2026, using `agy` 1.2.0, observed a command denial as a tool step with `state: "ERROR"` and `tool_info.error.type: "TOOL_ERROR"`. The terminal result had `status: "SUCCESS"`, an empty `response`, and `denied_actions: [{"action":"command","display_name":"RunCommand"}]`. Native permissions prevented the bridge command from running, so no test message reached the Bot. This is an observed version-specific shape, not an additional guarantee in Google's protocol documentation.

The bridge returns `blocked` for any error step, structured tool error, or nonempty valid `denied_actions` list. It preserves an empty provider response when blocker evidence exists; successful completion still requires nonempty text. Malformed denial records fail explicitly. Blocking is conservative, including a failed attempt followed by recovery. A denial omitted from structured output cannot be identified. Check the destination conversation, actual diff, and required checks before accepting the work. Do not automatically retry with broader permissions.

For each advertised route, record the real host, CLI and skill versions, bounded task, native session or Bot request ID, and independently verified result. Skill files and passing protocol fixtures alone do not establish live route acceptance.
