# Grok Bridge

**Grok Bot ↔ Codex. Grok Bot ↔ Claude Code. One CLI.**

An independent, open-source bridge for bounded task handoffs across these tools. One package, three destination adapters, four configured directions. MIT licensed, Node.js 22+, no runtime npm dependencies.

## Try the experimental alpha

The implementation is available on the [alpha source tag](https://github.com/niharnm/grok-bridge/tree/v0.1.0-alpha.1), with a scoped [implementation review](https://github.com/niharnm/grok-bridge/pulls). Main remains the project entry point while the implementation is reviewed.

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
grok-bridge doctor
```

Read the [full setup and commands](https://github.com/niharnm/grok-bridge/blob/v0.1.0-alpha.1/README.md), [Grok Bot setup](https://github.com/niharnm/grok-bridge/blob/v0.1.0-alpha.1/docs/grok-bot-setup.md), and [acceptance record](https://github.com/niharnm/grok-bridge/blob/v0.1.0-alpha.1/docs/acceptance.md).

| Direction | Route |
| --- | --- |
| Codex → Grok Bot | Shared CLI and forward skill |
| Claude Code → Grok Bot | The same CLI and forward skill |
| Grok Bot → Codex | Approved native local execution, then Codex CLI |
| Grok Bot → Claude Code | Approved native local execution, then Claude Code CLI |

Grok Bot submission/reply and the native Codex adapter have passed live checks on macOS. Claude provider access and the native Grok local-execution approval still block full four-way acceptance. Host plugin manifests have passed their validators. See the acceptance record for the exact limits.

The forward adapter uses the community `grok-bot-cli` and private gateway endpoints. Grok Bot's local-execution policy remains in control of reverse requests. This alpha does not claim production readiness, official vendor support, or four live-verified integrations.

[Architecture and reference study](https://github.com/niharnm/grok-bridge/blob/v0.1.0-alpha.1/docs/architecture.md) · [Release](https://github.com/niharnm/grok-bridge/releases/tag/v0.1.0-alpha.1) · [Report an issue](https://github.com/niharnm/grok-bridge/issues)
