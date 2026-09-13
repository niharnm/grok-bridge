# Set up Grok Bot

Grok Bridge connects Codex, Claude Code, Cursor, and Antigravity to Grok Bot through one CLI, with eight configured directions. Forward routes use the community `gbot` client. For a reverse route, a Bot runs `grok-bridge run` on a computer where the target coding CLI and repository are available.

The Codex/Grok Bot reciprocal path has passed live checks on macOS: Codex submitted a task and received a correlated reply, then Grok Bot invoked native local Codex execution and returned a result independently matched to the real Codex session and known fixture. The other six directions remain unverified. Claude provider access is disabled with a 403 response, Cursor requires CLI login, and Antigravity live acceptance is pending. Host plugin loading and saving the Bot skill are also unverified. See the [acceptance record](acceptance.md). The gateway and completion-marker convention remain experimental.

## A coding host to Grok Bot

On the computer running Codex, Claude Code, Cursor, or Antigravity, install Node.js 22 or newer, Grok Bridge, and the separately maintained community client:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
npm install -g grok-bot-cli@0.2.3
grok-bridge doctor
```

Install and sign in to the Grok Bot desktop app. The community client can use its existing session on macOS and Linux. Its inspected version does not implement Windows desktop-session loading. Explicit gateway configuration is a separate upstream option and has not been tested here. See the [community client's installation instructions](https://github.com/ScriptedAlchemy/grok-bot-cli#install).

List the live roster only when you are ready to access the account, then choose the UUID of a dedicated Bot:

```sh
gbot --gateway --json bots list
```

Write the task to a UTF-8 file, with one objective, allowed actions, relevant context, and expected output. Substitute its absolute path and the chosen Bot UUID:

```sh
grok-bridge send --agent BOT_UUID --task-file /absolute/task.txt --wait --timeout 600
```

The CLI adds a request ID and asks the Bot for an exact terminal marker. `send` without `--wait` only submits the task and returns `requestId`. To resume waiting for that request:

```sh
grok-bridge wait --agent BOT_UUID --request REQUEST_UUID --timeout 600
grok-bridge thread --agent BOT_UUID
```

Waiting accepts a correlated `completed` or `blocked` marker from a recognized Bot response. It does not infer completion from silence or the first assistant message. Unknown transcript formats remain unverified. A timeout does not cancel cloud work. An uncertain send must be inspected before any retry to avoid duplicate tasks.

The `gbot` gateway is private and undocumented by the provider. It is not the public xAI inference API, and an inference API key is not a substitute for Bot account access. Grok Bridge does not install `gbot`, copy account credentials, or verify authentication with its passive `doctor` command. The inspected implementation is [grok-bot-cli 0.2.3](https://github.com/ScriptedAlchemy/grok-bot-cli/tree/9192bf8f4c05d65abdb568554d3809ec5e4e380f).

## Grok Bot to a coding CLI on your computer

This route uses Grok Bot's native local execution. In Grok Bot, inspect **Settings > General > Agent > Execution on Local Computer** and approve the specific local task under your policy. The Bot's cloud terminal is a different computer. Local execution must be available before a Bot can reach a repository on your laptop. See [local-computer permissions](https://docs.x.ai/grok-bot/approvals-security-and-privacy).

On that same local computer:

1. Install Node.js 22 or newer and `grok-bridge` using the command above.
2. Install and authenticate the chosen [Codex CLI](https://developers.openai.com/codex/cli/), [Claude Code CLI](https://code.claude.com/docs/en/setup), [Cursor Agent CLI](cursor-setup.md), or [Antigravity CLI](antigravity-setup.md) through its supported setup. Complete login yourself.
3. Choose the exact repository and branch. Inspect any existing changes before assigning edits.
4. Ask the Bot to use its approved local execution to run `grok-bridge doctor`, then perform a small read-only task in that repository.

For example, have the Bot create a task file on the local computer that asks for a concise explanation of one known source file, then execute one of these commands there:

```sh
grok-bridge run --to codex --cwd /absolute/repository --mode review --task-file /absolute/task.txt
grok-bridge run --to claude --cwd /absolute/repository --mode review --task-file /absolute/task.txt
grok-bridge run --to cursor --cwd /absolute/repository --mode review --task-file /absolute/task.txt
grok-bridge run --to antigravity --cwd /absolute/repository --mode review --task-file /absolute/task.txt
```

Check the returned result against the source before trying `--mode work` with a scoped edit. Review and work permissions differ by target: Cursor work uses force inside its enabled sandbox, while Antigravity review supplies plan instructions without an enforced read-only boundary. Read the target's setup guide before an edit task. Installations and logins are separate setup actions. The bridge must not alter local-execution policies or invent an approval bypass.

## Save the reverse workflow as a Bot skill

After a successful bounded run, paste the following into that Bot's chat and review the saved instructions. Grok Bot documents creating skills from a completed workflow and enabling private skills under **Settings > Plugins > Yours**. Use `/` in its composer to select the saved skill. See [Bot skills](https://docs.x.ai/grok-bot/skills-routines-and-automations).

```text
Save the verified workflow as a skill named "Grok Bridge" with these rules:

Use only when I request a bounded task for Codex, Claude Code, Cursor,
or Antigravity. Require the target (codex, claude, cursor, antigravity),
execution host (my local computer or your cloud computer), exact
repository path and branch, review or work mode, allowed files, and
expected output. Ask only for missing information that prevents a safe
and unambiguous run.

Use approved native local execution for my local files. Verify that
grok-bridge and the chosen coding CLI exist on that computer. Use that
CLI's existing login. If local execution or login is unavailable, report
the block. Do not change permissions, copy credentials, or substitute
your cloud terminal for my local computer.

Write a minimal task file on the same computer, then invoke:
grok-bridge run --to TARGET --cwd ABSOLUTE_REPOSITORY --mode MODE
  --task-file ABSOLUTE_TASK_FILE --timeout 600

Run this as one command with the real values, quoting paths as needed.
Use review for review requests and work only for edits I authorize.
Read the target-specific permission limits first. Cursor work permits
automatic commands within its sandbox. Antigravity plan mode does not
enforce read-only access. Preserve native denials and never retry a
blocked task with broader permissions.
Assign exact files, preserve unrelated changes, and tell the child not
to delegate or call Grok Bridge again. Never start a handoff from a task
marked HANDOFF_CHILD or an already delegated child task. Never unset
GROK_BRIDGE_CHILD to bypass that guard. No publishing or outside
messages unless the current request authorizes them.

Inspect the result and actual repository changes. Verify relevant
checks yourself. Report completed work, errors, checks actually run,
and any remaining block. A child report is not independent verification.
Return to my task after one bounded run without a reciprocal loop.
```

This repository does not claim a filesystem installer for Grok Bot. `.grok/skills` and Grok Build plugin instructions belong to a different product and are not used here.

## Alternative: run on the Bot's cloud computer

Choose this explicitly when the work belongs on the cloud computer. Set up Node.js, Grok Bridge, the chosen coding CLI, its separate authentication, and an authorized repository clone under `/workspace`. A laptop path such as `/Users/...` does not refer to the laptop from the cloud terminal. Use the clone's real path, for example `/workspace/my-project`.

All Bots on an account share the cloud computer's files and credentials. Human takeover is required for login and verification steps; do not paste passwords or one-time codes into chat or transfer laptop authentication files. Keep project data under `/workspace` and retain setup instructions because manually installed packages can be replaced during updates. See [Bot computers and files](https://docs.x.ai/grok-bot/computer-and-apps).

## Acceptance checklist

Record each requested route against an authorized, harmless task. Current status:

| Route | Live status | Evidence to retain |
| --- | --- | --- |
| Codex to Grok Bot | Passed for a bounded task | Bot UUID, request ID, accepted send, correlated final reply, independently checked answer |
| Grok Bot to Codex | Passed through native local execution | Actual host, repository and branch, native session, fixture match, independently checked return |
| Claude Code to Grok Bot | Unverified; Claude provider access disabled | Authenticated source session plus forward-request evidence |
| Grok Bot to Claude Code | Unverified; Claude provider access disabled | Approved execution plus successful Claude session and checked result |
| Cursor to Grok Bot | Unverified | Loaded host skill, source session, forward-request evidence |
| Grok Bot to Cursor | Unverified; Cursor CLI login required | Approved execution plus authenticated Cursor session and checked result |
| Antigravity to Grok Bot | Unverified | Loaded host skill, source session, forward-request evidence |
| Grok Bot to Antigravity | Live acceptance pending | Approved execution plus native Antigravity session and checked result |

Codex standalone review, explicit session resume, and a scoped work-mode edit also passed. Those checks establish the tested Codex adapter behavior; they do not establish the other hosts' routes. For an edit test, use a disposable repository or isolated worktree, compare the final diff, and run its relevant checks. Manifest validation, mocked process tests, and installed executables do not establish live host skill loading or a saved Bot skill.
