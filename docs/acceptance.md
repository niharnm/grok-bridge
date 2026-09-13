# Acceptance record

Checked September 13, 2026. Implementation, offline tests, live provider checks, and blocked acceptance are separate below. No private account IDs or raw provider transcripts are published.

## Environment

- macOS host, Node.js 26.5.0.
- Codex CLI 0.153.4, Claude Code 2.1.266, Cursor Agent 2026.09.10-fd3934a, Antigravity CLI 1.2.0.
- Community grok-bot-cli 0.2.3, inspected commit `9192bf8f4c05d65abdb568554d3809ec5e4e380f`.
- A dedicated Grok Bot and an isolated scratch Git repository with a known fixture.

## Eight configured directions

| Direction | Observed result | Remaining boundary |
| --- | --- | --- |
| Codex to Grok Bot | Codex-originated `send --wait` received an acknowledged submission and a correlated `completed` reply containing the expected `GROK_BRIDGE_REPLY_OK` | Live Codex plugin discovery is separate |
| Grok Bot to Codex | Bot invoked the shared CLI through native local execution; returned session and fixture were independently matched against the actual local Codex session | Saved Bot skill UI remains unverified |
| Claude Code to Grok Bot | Not executed from an authenticated Claude session | The account's Claude Code subscription access is disabled |
| Grok Bot to Claude Code | Not completed end to end; direct target access probe returned 403 | Working Claude provider access is required |
| Cursor to Grok Bot | Not executed from an authenticated Cursor Agent session | Official standalone CLI requires login |
| Grok Bot to Cursor | Not completed end to end; direct target probe failed on authentication | Cursor CLI login is required |
| Antigravity to Grok Bot | One direct native source-host attempt was denied by Antigravity's command policy before submission | Native command permission is required; no policy changes or broader retries were made |
| Grok Bot to Antigravity | Bot invoked the shared CLI through native local execution and returned the expected fixture; local native conversation data independently matched the handoff and fixture | Saved Bot skill and Antigravity host skill discovery remain unverified |

Three requested directions have live exchange evidence. These checks do not establish all eight routes, IDE integration, marketplace acceptance, or production readiness. Grok reply correlation depends on an observed private gateway shape and the bridge's completion-marker convention.

## Native adapters

| Check | Observed result |
| --- | --- |
| Codex review | Read the known fixture using native authentication and JSONL output |
| Codex explicit resume | Returned the same native session and recalled the fixture without another read |
| Codex work | Created the requested file with exact `BRIDGE_WRITE_OK` plus newline; the original fixture was unchanged |
| Claude access denial | Actual native 403 became `PROVIDER_ACCESS_DENIED`, exit 1 |
| Cursor access denial | Actual authentication failure became a failed command, exit 1; no login was initiated |
| Antigravity review | Read the known fixture through one native streaming JSON turn |
| Antigravity work | Created the requested file with exact `ANTIGRAVITY_WRITE_OK` plus newline; prior fixture and Codex output were unchanged |
| Antigravity source-host permission denial | Native CLI returned exit 0, `SUCCESS`, empty response, an `ERROR` step, and `denied_actions`; the updated parser replayed that captured stream as `blocked`, preserving the empty provider response |

Antigravity review requests plan mode. It is not an enforced filesystem write lock. Cursor work adds its documented force flag within the enabled sandbox. Required actions must be checked independently even when a provider returns a completed response.

## Offline verification

`npm test` passed 87 protocol, process, and CLI tests covering:

- Literal arguments and stdin without shell expansion; nonzero and spawn failures.
- Combined output limits, deadlines, SIGINT, EPIPE, and ordinary POSIX descendant cleanup.
- Input validation before submission, input-stream deadlines, and recursion guards.
- Empty resume ID rejection before reading a task or dispatching a provider.
- Coding permissions, terminal-result validation, native session arguments, and observed permission-denied results.
- Cursor and Antigravity dispatch, result identity, malformed events, incomplete turns, and false-success prevention.
- Grok target validation, group rejection, accepted acknowledgements, ambiguous sends, and no automatic retries.
- Exact request correlation, user echoes, unrelated and streaming entries, final markers, malformed responses, timeout, and abort.

`npm run check` passed JavaScript syntax and JSON parsing checks. Prettier 3.6.2 checks passed. There is no compilation step or TypeScript project. Official Codex plugin, Agent Skill, Claude plugin/marketplace, and Cursor template validators passed. Cursor reported only optional absent hooks/MCP notices. These validators do not establish provider access or native skill loading.

CI runs Node.js 22/24 on macOS/Linux. Consult the [actual workflow runs](https://github.com/niharnm/grok-bridge/actions/workflows/ci.yml) for results, rather than treating a configured matrix as a pass. The packed artifact contained 27 intended runtime, plugin, skill, and documentation files, with no test-account data. An offline install into a fresh task-local prefix passed `--version` and `--help`. Public installation evidence will be recorded with the release.

## Open acceptance

1. Restore permitted Claude provider access, then exercise both Claude directions.
2. Authenticate the official Cursor CLI, then exercise both Cursor directions.
3. Permit the specific source-host bridge command through Antigravity's native policy, then repeat its forward test.
4. Install through each host's normal plugin/skill mechanism and test actual discovery, including the saved Grok Bot skill.
5. Verify another clean machine and Windows before claiming those environments work.

The requested full acceptance is incomplete. This release remains an experimental alpha, with no claim of marketplace approval or independent adoption.
