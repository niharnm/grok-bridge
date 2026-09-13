# Set up Cursor

The same Grok Bridge plugin supports two Cursor routes:

| Route | Execution path |
| --- | --- |
| Cursor to Grok Bot | Cursor loads the shared `forward` skill and calls `grok-bridge send`, which uses the community `gbot` client |
| Grok Bot to Cursor | A Bot uses approved execution on the chosen computer to call `grok-bridge run --to cursor`, which starts the official Cursor Agent CLI |

The forward gateway is experimental. This alpha has no verified authenticated Cursor exchange or Cursor IDE plugin-loading acceptance yet. The adapter uses the official CLI, not an editor-control API. It does not install a VS Code extension or treat Grok Bot's gateway as Cursor IDE access.

## Install the pinned alpha

Install Node.js 22 or newer and the tagged CLI:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
```

Use the tag for both the runtime and plugin. The repository's default branch can differ from the alpha's implementation.

For Cursor's native plugin, clone the same tag into a new directory:

```sh
git clone --branch v0.1.0-alpha.1 --depth 1 https://github.com/niharnm/grok-bridge.git grok-bridge-alpha
```

Copy the clone's `plugins/grok-bridge` directory, including its hidden `.cursor-plugin` directory, into `~/.cursor/plugins/local/grok-bridge`. If that destination already exists, inspect it before updating; preserve any local changes. Restart Cursor or run **Developer: Reload Window**, then confirm the `forward` and `run` skills under **Customize**.

This follows Cursor's documented [local plugin import workflow](https://cursor.com/docs/plugins#test-plugins-locally). Your organization may restrict local plugin imports. An already installed marketplace plugin with the same name takes precedence. Stop and resolve that setup issue instead of weakening an organization policy.

The plugin includes `.cursor-plugin/plugin.json` and discovers the same `skills/` used by the Codex and Claude packages. The repository also includes `.cursor-plugin/marketplace.json` pointing to `./plugins/grok-bridge` for future marketplace distribution. This is the native structure documented in the [Cursor plugin reference](https://cursor.com/docs/reference/plugins) and [official template](https://github.com/cursor/plugin-template). Shipping that manifest does not establish a public marketplace listing.

## Cursor to Grok Bot

Install the separately maintained forward client and sign in to Grok Bot using its supported desktop setup:

```sh
npm install -g grok-bot-cli@0.2.3
grok-bridge doctor --to grok
```

The community client's desktop-session support in this version is macOS and Linux. See [Grok Bot setup](grok-bot-setup.md) for credential, platform, and gateway limits. `doctor` checks executable availability, not account access.

In Cursor, ask the `forward` skill to send one small task to your chosen Bot UUID. Include the objective, allowed context, output format, and limits. The skill uses:

```sh
grok-bridge send --agent BOT_UUID --task-file /absolute/task.txt --wait --timeout 600
```

Substitute the chosen UUID and an actual task file. The Bot must not delegate again. A send acknowledgement means submitted; waiting requires a recognized response with the matching request ID and terminal marker. A timeout ends local waiting without cancelling cloud work. Verify the returned answer independently and preserve the request ID for follow-up.

## Grok Bot to Cursor

Install and authenticate the [official Cursor Agent CLI](https://cursor.com/docs/cli/installation) on the computer that holds the requested repository. The executable is `agent`. If it is installed at a custom path, configure `GROK_BRIDGE_CURSOR_BIN` to that absolute executable path.

```sh
grok-bridge doctor --to cursor
```

For a local repository, the Bot must use its enabled and approved native local execution. Its cloud terminal cannot reach a laptop path just because that path appears in the prompt. Follow [Grok Bot's local-computer setup](grok-bot-setup.md), substituting the Cursor CLI for the target. Authentication is completed by the user on that same computer; do not transfer credential files or paste secrets into the task.

Give the Bot the exact host, repository path, branch, allowed files, and a read-only task. Have it write the task file on that computer and invoke:

```sh
grok-bridge run --to cursor --cwd /absolute/repository --mode review --task-file /absolute/task.txt --timeout 600
```

Review uses `--mode ask --sandbox enabled` without force. For authorized edits, `--mode work` uses `--force --sandbox enabled`: Cursor's [headless documentation](https://cursor.com/docs/cli/headless#file-modification-in-scripts) requires force to apply edits instead of only proposing them. Work can approve commands automatically within the sandbox constraints, while native explicit denials still apply. This is not an interactive approval relay or a complete filesystem isolation guarantee. The bridge does not add `--trust` or `--approve-mcps`. A denied tool call or required interaction is a blocker, not permission to rerun with weaker controls. Read the result, inspect any actual diff, and run the relevant checks before accepting the work.

The Bot can save this verified workflow as a private skill using the [Bot skill setup procedure](grok-bot-setup.md#save-the-reverse-workflow-as-a-bot-skill), including `cursor` as a target. Retain the `HANDOFF_CHILD` and `GROK_BRIDGE_CHILD` rules to prevent reciprocal loops.

## Record live acceptance

Before calling either route verified, record the actual host and CLI/plugin version, a bounded authorized task, and the independently checked result. The forward route also needs its Bot UUID, request ID, accepted submission, and correlated final response. The reverse route needs its real repository and branch, Cursor result, and checks of any edit. Source inspection and manifest validation do not establish those account-level results.
