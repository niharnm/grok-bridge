# Launch drafts and distribution notes

Prepared for Nihar on 2026-09-13 for `0.1.0-alpha.1`. The [alpha release](https://github.com/niharnm/grok-bridge/releases/tag/v0.1.0-alpha.1) is published and its tagged GitHub installation passed. The implementation remains in [review PR #1](https://github.com/niharnm/grok-bridge/pull/1), without a merge. Social posts below remain unpublished drafts.

Project: [niharnm/grok-bridge](https://github.com/niharnm/grok-bridge).

## Distribution record

A focused [awesome-grok-bot tool submission](https://github.com/majiayu000/awesome-grok-bot/pull/7) adds one factual alpha entry to each language README. Upstream lint passed with `OK 830 entries`. The PR discloses the private gateway, verified subset of routes, remaining authentication/permission gaps, and Cursor work-mode behavior for maintainer review. Submission is pending; it is not an accepted listing or evidence of adoption. No social announcement, direct message, or vendor marketplace submission has been posted.

## Positioning

An open-source CLI for explicit task handoffs between Grok Bot, Codex, Claude Code, Cursor, and Antigravity, with one shared implementation and eight configured directions.

State the alpha limits beside that description: the Codex/Grok Bot reciprocal path passed live checks, including an independently checked native Codex session and fixture on the return path. Grok Bot to Antigravity also passed with its native session and fixture independently checked. Claude provider access returns 403, Cursor requires CLI login, and Antigravity source-host command permissions blocked its forward attempt. Host plugin loading and saved Bot skills remain unverified. The forward transport uses the community `gbot` client and an undocumented provider gateway. Reverse tasks run on the selected computer where the coding CLI, login, and repository exist.

Use the tagged GitHub installation: `npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1`. Do not advertise `npm install grok-bridge` as a registry release unless that release has actually been published and checked.

## X post draft

> I'm Nihar, building Grok Bridge: Grok Bot ↔ Codex, Claude Code, Cursor & Antigravity. One CLI, eight configured directions. 3/8 directions live-tested; access gaps documented. Experimental alpha using community gbot. https://github.com/niharnm/grok-bridge

## Technical community post draft

**Title:** Grok Bridge alpha: task handoffs between Grok Bot, Codex, Claude Code, Cursor, and Antigravity

I'm Nihar, the author of [Grok Bridge](https://github.com/niharnm/grok-bridge). I wanted a small way to pass a bounded task between these tools and inspect the returned result without maintaining a separate implementation for each direction.

The alpha has one CLI, native Codex, Claude Code, and Cursor plugin packaging, an Antigravity skill, and Grok Bot setup instructions. It configures eight directions between Grok Bot and those four coding hosts. Forward requests use the third-party `gbot` client. Reverse requests invoke the chosen coding CLI on the selected host, using that host's repository and existing authentication.

The distinction between submission and completion matters: a send acknowledgement returns `submitted`. Waiting accepts an exact terminal marker only from a Bot message tied to the matching request. Prompt echoes, unrelated replies, and an idle conversation do not count. Reads cover the most recent 200 transcript entries, and a timeout does not cancel cloud work.

The Codex/Grok Bot reciprocal path has been exercised live. Codex submitted a task and received a correlated Bot reply; Grok Bot then invoked local Codex and returned a result that was independently matched to the native session and a known fixture. Standalone Codex review, explicit resume, and scoped edits also passed. Native Antigravity reads and edits, plus the Grok Bot to Antigravity direction, also passed. Five directions remain unverified: Claude provider access is disabled, Cursor needs CLI login, and Antigravity source-host command permission was denied. Plugin UI loading and saving the Bot skill have not been verified. The undocumented gateway can change and break this adapter. This is an experimental independent project with no vendor endorsement.

The repository includes pinned installation instructions, tests, and current limits. Reproducible feedback is welcome, especially for the Claude, Cursor, and Antigravity routes and normal host skill loading. Please include versions and a minimal task, and remove credentials and private transcript content from reports.

## Recommended destinations

These are three relevant destinations to revisit after live acceptance. Each destination has its own requirements. A directory entry can describe the usable alpha without claiming all eight directions passed.

| Destination | Fit and submission rules | Recommendation |
| --- | --- | --- |
| [majiayu000/awesome-grok-bot](https://github.com/majiayu000/awesome-grok-bot) | Its [contribution guide](https://github.com/majiayu000/awesome-grok-bot/blob/main/CONTRIBUTING.md#add-a-field-case-or-a-github-tool) accepts usable GitHub bridges. Add the same repository URL and one factual sentence to the English and Chinese READMEs under Skills and tools. Do not add a tool to `catalog.json` or invent a Bot share URL. Use PR title `Add tool Grok Bridge`. | Best community fit. After the public install passes, propose one focused alpha entry and disclose the live gaps and Cursor work permission behavior for maintainer review. The repository was unarchived and updated on 2026-09-13 when checked. |
| [Claude community marketplace](https://github.com/anthropics/claude-plugins-community) | Submit through the [Console form](https://platform.claude.com/plugins/submit). Run `claude plugin validate` against the plugin directory first. The [current Claude documentation](https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-community-marketplace) describes validation and safety screening. The [catalog is a mirror](https://github.com/anthropics/claude-plugins-community#submitting-a-plugin); direct PRs are closed automatically. | Wait for authenticated Claude tests and independent installation. Community approval does not place the project in `claude-plugins-official`, which is curated separately. Individual authors can use the Console form; the Claude.ai form requires Team or Enterprise directory access. |
| [OpenAI Plugins Directory](https://platform.openai.com/plugins) | The [third-party integration rules](https://developers.openai.com/plugins/app-guidelines#third-party-content-and-integrations) exclude plugins primarily built as unofficial third-party connectors or pass-through intermediaries. Skills-only packaging support does not establish eligibility. | Not submitted. The bridge depends on an unofficial Grok gateway, so the current product appears to fall under that restriction. Revisit only if the integration or published policy changes. |

The [OpenAI packaging documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli) supports Git-backed marketplace distribution. Keep the repository marketplace as the initial Codex distribution path; directory submission is a separate action.

## Channels to defer

[milisp/awesome-codex-cli](https://github.com/milisp/awesome-codex-cli/blob/main/contributing.md) requires functional Codex support and proven external usage, such as downloads or community activity. It was unarchived and updated on 2026-09-09 when checked. Revisit after real adoption; do not manufacture stars or usage to meet the gate.

[shinpr/awesome-codex-workflows](https://github.com/shinpr/awesome-codex-workflows/blob/main/CONTRIBUTING.md) expects projects presented as ready for others to use and excludes experiments or proofs of concept. This explicitly experimental alpha is premature for that list.

[Show HN](https://news.ycombinator.com/showhn.html) expects a substantive project people can actually try, created by someone available to discuss it. It disallows requests for upvotes or coordinated comments. Revisit after a usable demonstration and the live acceptance gaps are closed; the technical draft above is not a claim that a Show HN has been posted.

## Before a public submission

Record one harmless, independently checked exchange for each direction, with versions, actual execution host, expected result, and observed result. Confirm the package installs from the public repository on a clean setup. Publish a short demo of those actual runs, with private data removed. Update the drafts when evidence changes.

Submit to a relevant destination only through its documented process. Track the real submission URL and result. No promotional issues on unrelated upstream repositories, repeated reposts, unsolicited direct messages, or claims of listing before acceptance.
