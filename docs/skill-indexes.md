# Install the shared Agent Skill

The canonical source is [`skills/grok-bridge/SKILL.md`](../skills/grok-bridge/SKILL.md), named `grok-bridge` in the `niharnm/grok-bridge` repository. It teaches the existing CLI; it contains no second runtime. Use the fully qualified repository name because other unrelated projects use the same skill name.

The [Grok Bridge pack on skills.sh](https://skills.sh/p/o02Pja39oijRhbnx) is an
unlisted share link that anyone can view and install without authentication:

```sh
npx skills@1.5.26 add https://skills.sh/p/o02Pja39oijRhbnx --agent codex
```

It contains the shared skill uploaded from commit `6c2ce49` on September 13,
2026. It is a snapshot; update the pack when the source skill changes. One
fresh installation matched the source bytes. Its initial download count is
that verification test, not independent adoption or leaderboard inclusion.
The pinned CLI runtime below remains a separate installation.

Install into the current project with the [Skills CLI](https://github.com/vercel-labs/skills), using Node.js 22.20.0 or newer for version 1.5.26. These commands select the shared skill from the `main` branch, which can change. The older runtime tag does not include this new root entrypoint.

```sh
npx skills@1.5.26 add https://github.com/niharnm/grok-bridge/tree/main/skills/grok-bridge --agent codex
```

Use `claude-code`, `cursor`, `antigravity`, or `antigravity-cli` instead of `codex` for the relevant host. The installer places Codex, Cursor, and Antigravity project skills under `.agents/skills`, and Claude Code skills under `.claude/skills`. Installation is a file operation, not proof of native skill loading. Antigravity has differing CLI and IDE discovery documentation; check the [host setup guide](antigravity-setup.md) before adding a second copy. The Skills CLI's `grok` target is **Grok Build**, not Grok Bot. Grok Bot uses its own [saved-skill workflow](grok-bot-setup.md). [Installer agent definitions](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/agents.ts).

The repository shorthand uses its default branch, currently `main`:

```sh
npx skills@1.5.26 add niharnm/grok-bridge --list
npx skills@1.5.26 add niharnm/grok-bridge --skill grok-bridge --agent codex
```

The bridge itself remains a separate pinned install:

```sh
npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1
grok-bridge doctor
```

Use the [Codex and Claude Code setup](../README.md#install-the-host-plugins), [Cursor setup](cursor-setup.md), [Antigravity setup](antigravity-setup.md), and [Grok Bot setup](grok-bot-setup.md) for destination CLIs, authentication, and permissions. Installing the shared skill and a host plugin together is unnecessary for the same workflow.

This is an experimental alpha with eight configured directions and three live verified directions. Claude access, Cursor login, Antigravity source-host command permission, and native skill discovery still limit acceptance. Read the [evidence and remaining checks](acceptance.md).

## How discovery works

Checked September 13, 2026. Catalog inclusion is separate from installation, provider access, and marketplace approval.

| Catalog                                                                               | Discovery route                                                                                                                             | Status at this check                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [skills.sh](https://skills.sh/)                                                       | Real user installs through the Skills CLI supply aggregate telemetry; there is no separate normal leaderboard submission                    | The expected [repository/skill page](https://skills.sh/niharnm/grok-bridge/grok-bridge) rendered its unavailable/404 state, despite HTTP 200          |
| [SkillsMP](https://skillsmp.com/)                                                     | Public GitHub `SKILL.md` with `name` and `description`, plus repository topic `claude-skills` or `claude-code-skill`; documented daily sync | [Search for grok-bridge](https://skillsmp.com/search?q=grok-bridge) returned unrelated projects, not `niharnm/grok-bridge`; our listing is unverified |
| [Smithery Skills](https://smithery.ai/skills)                                         | Explicit authenticated registration of a GitHub skill URL under a namespace                                                                 | `GET /skills/niharnm/grok-bridge` returned 404, `Skill not found`; no submission made                                                                 |
| [Composio Awesome Claude Skills](https://github.com/ComposioHQ/awesome-claude-skills) | Curated pull request adding the skill folder and a README entry                                                                             | No submission made; native Claude execution remains blocked, so its Claude-platform testing requirement is not established                            |

### skills.sh

The [FAQ](https://skills.sh/docs/faq) describes automatic ranking from actual user installations. Publishing the repository alone does not prove listing. `--list` previews skills without installing. For validation without contributing install telemetry or audit requests, set `DISABLE_TELEMETRY=1`; do not generate installs to manufacture popularity. [Telemetry behavior](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/telemetry.ts).

Version 1.5.26 discovers conventional `skills/` folders and paths declared through Claude plugin manifests. Before the shared entrypoint was added, this repository's marketplace exposed only `forward` and `run` in normal discovery. The nested Antigravity wrapper was not found. The root `skills/grok-bridge` path provides a shared name independent of plugin grouping. Direct tree URLs also select a specific directory. [Discovery source](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/skills.ts), [plugin discovery](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/plugin-manifest.ts), [source URL parsing](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/source-parser.ts).

### SkillsMP

The [submission FAQ](https://skillsmp.com/docs/faq) documents GitHub auto-indexing, the two topic names, and daily sync. It says manual submissions are not available yet. The current rules do not state a minimum star count, a promised ranking, or a guaranteed ingestion time. Repository maintainers can add either documented topic, publish the root skill on the default branch, then check the catalog after its normal sync. No special SkillsMP identifier belongs in frontmatter; copy the catalog's actual URL once it exists.

SkillsMP already displays nested source paths in search results, so a root `SKILL.md` file is not necessary. Its published rules do not specify maximum crawl depth or branch handling. The conventional `skills/grok-bridge/SKILL.md` path on the default branch avoids relying on undocumented behavior. Catalog entries are community-sourced, not individually acceptance-tested. [SkillsMP FAQ](https://skillsmp.com/docs/faq), [project description](https://skillsmp.com/about).

### Smithery

The documented submission is `PUT https://api.smithery.ai/skills/{namespace}/{slug}` with an API key and JSON containing `gitUrl`. The proposed identifier is `niharnm/grok-bridge`, subject to ownership of that namespace. The proposed source is `https://github.com/niharnm/grok-bridge/tree/main/skills/grok-bridge`. Public registry responses show existing skills with nested GitHub tree URLs. No credentials or account setup are supplied by this repository. [Registration API](https://smithery.ai/docs/api-reference/skills/create-or-update-a-skill), [namespaces](https://smithery.ai/docs/concepts/namespaces).

After a successful registration, verify the returned metadata and listing status before advertising installation. The documented consumer command would then be:

```sh
npx smithery skill add niharnm/grok-bridge --agent codex
```

This command is conditional on registration and has not been validated for this entry. The [Smithery CLI documentation](https://smithery.ai/docs/concepts/cli) describes skill search and installation. Do not publish the CLI as an MCP server just to enter the catalog.

### Composio Awesome Claude Skills

The [contribution rules](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/CONTRIBUTING.md) require a real use case, clear instructions and examples, appropriate safety, and testing on Claude.ai, Claude Code, or the API. Submission includes a skill directory and an alphabetized README entry through a pull request. This is not an automatic GitHub crawler. Preserve the native Claude testing gap in any proposal; an offline adapter test does not meet that platform check.

## Validation boundary

The canonical skill can be checked and installed from a local checkout without sending catalog telemetry:

```sh
DISABLE_TELEMETRY=1 npx skills@1.5.26 add /absolute/grok-bridge --list
DISABLE_TELEMETRY=1 npx skills@1.5.26 add /absolute/grok-bridge --skill grok-bridge --agent codex --copy --yes
```

Run those commands from a disposable project directory. Check that its `.agents/skills/grok-bridge/SKILL.md` matches the source. This establishes CLI discovery and file installation only. Separately verify public-source installation after publishing, catalog visibility after indexing, and actual loading in an authenticated destination session.

Public-source acceptance on September 13, 2026: the pinned Skills CLI installed `https://github.com/niharnm/grok-bridge/tree/alpha/skills/grok-bridge` into a fresh project for Codex. The copied file matched the published source. Both documented SkillsMP repository topics are now present. Validation used `DISABLE_TELEMETRY=1`; no repeated installations were generated to influence a leaderboard. Catalog inclusion remains unverified.
