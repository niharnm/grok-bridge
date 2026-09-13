# Contributing

Start with a small reproducible issue or a focused pull request. Keep the shared runtime independent of host packaging and add a regression test for a behavior change.

```sh
npm run check
npm test
npm pack --dry-run
```

Tests use Node's built-in test runner and do not require provider credentials. Separate fixture tests from live provider evidence. Never commit account files, real private transcripts, Bot account IDs, or tokens. Synthetic fixtures should be clearly identified as such.

For adapter changes, verify argument construction, deadlines, cancellation, error handling, and terminal-result detection. Grok changes must also test user echoes, unrelated request IDs, malformed schemas, and ambiguous sends. Do not add automatic retries around non-idempotent sends.

Document exact destination versions and execution host for a live check. Report an authentication block as a block. A response containing a completion marker does not independently prove a requested code change was correct.

For plugins, keep both manifests and the marketplace version aligned with `package.json`, and validate them using each host's tooling. A Grok Bot skill workflow must not claim support for Grok Build installation conventions.

Discuss new runtime dependencies, servers, persistent credential handling, and expanded permission modes before implementing them.
