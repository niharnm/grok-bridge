# Changelog

## 0.1.0-alpha.2

- Muse Code destination: `run --to muse` drives Meta's `muse exec --json` with review and work modes, explicit session continuation, and a private prompt file.
- Muse Code host skill under `integrations/muse` and a [setup guide](docs/muse-setup.md) for both directions.
- Ten configured directions. The Muse Code routes have offline and replayed-capture tests only; no live Muse exchange is recorded yet.
- Install commands, plugin manifests, marketplace references, and the website now point at this tag, so a pinned install includes every documented target.
- No change to the Codex, Claude Code, Cursor, Antigravity, or Grok Bot adapters.

## 0.1.0-alpha.1

- One shared CLI for eight configured handoff routes across Grok Bot, Codex, Claude Code, Cursor, and Antigravity.
- Bounded native coding sessions with explicit workspace, review/work mode, and session continuation.
- Experimental Grok Bot submission, transcript reads, and request-correlated completion/blocker waiting through community `gbot`.
- Codex, Claude Code, and Cursor plugin manifests with reusable skills, an Antigravity skill, plus native Grok Bot local-execution setup instructions.
- Subprocess limits, recursion guards, failure reporting, offline tests, and an explicit live acceptance record.
