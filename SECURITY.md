# Security and data boundaries

Grok Bridge runs other command-line tools using the authority already available to those tools. It is not a sandbox, identity provider, or cross-computer permission system.

- Choose the exact Bot, execution computer, repository, and permitted files. Treat destination output as untrusted evidence.
- Keep task files free of credentials and unrelated private context. The bridge does not read account secrets, but the separately installed community `gbot` client uses the Grok Bot application's stored session. Review that upstream client before use.
- Codex, Claude, and Antigravity prompts travel through stdin. Cursor and upstream `gbot` receive message text as a command argument, which may expose task text in local process listings. The bridge never prints child stderr or provider error bodies in its own failure JSON.
- Native tools may retain sessions and run configured hooks. Claude `review` restricts its model-facing tools, but does not neutralize arbitrary startup hooks. Use trusted workspaces and native settings.
- Cursor work explicitly uses `--force` with its sandbox enabled; native deny rules apply. Antigravity plan mode is an instruction-level review request, not a hard read-only boundary. Its accept-edits mode can still soft-deny actions. Neither path proves a task succeeded solely because a response was returned.
- Grok Bot's account shares a cloud computer. Files and logins there are available to other Bots on that account. Do not copy laptop authentication files to it.
- Local process cleanup covers descendants in the same POSIX process group. Deliberately detached processes can escape it. Windows process cleanup is unverified, and `.cmd` wrappers are not launched through an implicit shell. Use native executables if testing Windows.
- A Grok timeout stops polling only. Inspect the Bot conversation to stop or recover its work. Never blindly retry an ambiguous send.
- There is no automatic update, telemetry, HTTP server, or remote shell endpoint in this package. No runtime npm packages are installed by it.

For a suspected vulnerability, use [GitHub private vulnerability reporting](https://github.com/niharnm/grok-bridge/security/advisories/new) if available. Do not put credentials or private transcripts in a public issue. For non-sensitive compatibility reports, open an issue with the destination versions, operating system, command shape, and sanitized failure code.
