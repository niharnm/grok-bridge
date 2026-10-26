import test from "node:test";
import assert from "node:assert/strict";
import {
  localArguments,
  parseCodex,
  parseClaude,
  runLocal,
} from "../src/local.js";

const session = "11111111-1111-4111-8111-111111111111";
const codex = [
  { type: "thread.started", thread_id: session },
  { type: "item.completed", item: { type: "agent_message", text: "Working." } },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "Checked the file." },
  },
  { type: "turn.completed" },
]
  .map(JSON.stringify)
  .join("\n");
const claude = {
  type: "result",
  subtype: "success",
  is_error: false,
  session_id: session,
  result: "Checked the file.",
};

test("Codex requires a terminal event and keeps the final message", () => {
  assert.deepEqual(parseCodex(codex), {
    status: "completed",
    session,
    result: "Checked the file.",
  });
  assert.throws(
    () => parseCodex(codex.split("\n").slice(0, -1).join("\n")),
    /complete turn/,
  );
  assert.throws(
    () => parseCodex(`${codex}\n{"type":"turn.failed"}`),
    /failed turn/,
  );
  assert.throws(() => parseCodex("not JSON"), /invalid JSONL/);
});

test("Claude reports provider failure and permission blocks honestly", () => {
  assert.equal(parseClaude(JSON.stringify(claude)).status, "completed");
  assert.equal(
    parseClaude(
      JSON.stringify({
        ...claude,
        permission_denials: [{ tool_name: "Bash" }],
      }),
    ).status,
    "blocked",
  );
  assert.throws(
    () =>
      parseClaude(
        JSON.stringify({ ...claude, is_error: true, api_error_status: 403 }),
      ),
    { code: "PROVIDER_ACCESS_DENIED" },
  );
  assert.throws(
    () =>
      parseClaude(JSON.stringify({ ...claude, subtype: "error_max_turns" })),
    /failed turn/,
  );
  assert.throws(
    () => parseClaude(JSON.stringify({ ...claude, result: "" })),
    /final result/,
  );
  assert.throws(() => parseClaude("null"), /unsupported result/);
});

test("permissions are explicit and resume does not use --last", () => {
  const review = localArguments({ to: "codex", cwd: "/tmp/repo", session });
  assert.ok(review.includes("read-only"));
  assert.ok(review.includes('approval_policy="never"'));
  assert.deepEqual(review.slice(-3), ["resume", session, "-"]);
  assert.ok(
    localArguments({ to: "codex", cwd: "/tmp/repo", mode: "work" }).includes(
      "workspace-write",
    ),
  );
  const claudeReview = localArguments({ to: "claude", cwd: "/tmp/repo" });
  assert.ok(claudeReview.includes("Read,Glob,Grep"));
  assert.ok(claudeReview.includes("dontAsk"));
  assert.ok(claudeReview.includes("--strict-mcp-config"));
  assert.ok(!claudeReview.includes("Bash"));
  assert.ok(
    localArguments({ to: "claude", cwd: "/tmp/repo", mode: "work" }).includes(
      "acceptEdits",
    ),
  );
  assert.throws(() => localArguments({ to: "codex", mode: "unsafe" }), /Mode/);
});

test("local task stays on stdin and carries the recursion guard", async () => {
  const task = "Literal $(touch /tmp/should-not-exist) `whoami`\nSecond line.";
  let invocation;
  const result = await runLocal({
    to: "codex",
    cwd: "/tmp/repo",
    requestId: session,
    task,
    execute: async (...args) => {
      invocation = args;
      return { stdout: codex };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(invocation[0], "codex");
  assert.ok(!invocation[1].join(" ").includes(task));
  assert.ok(invocation[2].input.endsWith(`${task}\n`));
  assert.equal(invocation[2].env.GROK_BRIDGE_CHILD, "1");
  assert.ok(invocation[2].input.includes("HANDOFF_CHILD:"));
});

test("Claude nonzero structured auth denial is parsed without leaking its body", async () => {
  const error = Object.assign(new Error("nonzero"), {
    code: "PROCESS_EXIT",
    stdout: JSON.stringify({
      ...claude,
      is_error: true,
      api_error_status: 403,
      result: "private detail",
    }),
  });
  await assert.rejects(
    runLocal({
      to: "claude",
      cwd: "/tmp/repo",
      task: "check",
      requestId: session,
      execute: async () => {
        throw error;
      },
    }),
    (e) =>
      e.code === "PROVIDER_ACCESS_DENIED" &&
      !e.message.includes("private detail"),
  );
});

test("Cursor dispatch uses a literal prompt argument and the selected executable", async () => {
  let invocation;
  const result = await runLocal({
    to: "cursor",
    cwd: "/tmp/repo",
    task: "Read $(literal).",
    requestId: session,
    bin: "/custom/cursor-agent",
    execute: async (...args) => {
      invocation = args;
      return { stdout: JSON.stringify(claude) };
    },
  });
  assert.equal(result.provider, "cursor");
  assert.equal(invocation[0], "/custom/cursor-agent");
  assert.equal(invocation[2].input, "");
  assert.equal(invocation[1].at(-2), "--");
  assert.match(invocation[1].at(-1), /TASK\nRead \$\(literal\)\./);
  assert.equal(invocation[2].env.GROK_BRIDGE_CHILD, "1");
});

test("Antigravity dispatch encodes one stdin event and preserves a blocked result", async () => {
  let invocation;
  const events = [
    { event: "init", conversation_id: session, init: {} },
    {
      event: "step_update",
      step_update: {
        conversation_id: session,
        step_index: 0,
        state: "DONE",
        step_type: "tool",
        tool_info: { error: { type: "denied", message: "No permission" } },
      },
    },
    {
      event: "result",
      result: {
        conversation_id: session,
        status: "SUCCESS",
        response: "Could not read.",
      },
    },
  ];
  const result = await runLocal({
    to: "antigravity",
    cwd: "/tmp/repo",
    task: "Read fixture.",
    requestId: session,
    timeoutMs: 5000,
    execute: async (...args) => {
      invocation = args;
      return { stdout: events.map(JSON.stringify).join("\n") };
    },
  });
  assert.equal(result.provider, "antigravity");
  assert.equal(result.status, "blocked");
  assert.equal(invocation[0], "agy");
  assert.ok(invocation[1].includes("5000ms"));
  assert.equal(invocation[2].input.trim().split("\n").length, 1);
  const input = JSON.parse(invocation[2].input);
  assert.equal(input.event, "user");
  assert.match(input.message.content, /TASK\nRead fixture\./);
  assert.equal(invocation[2].env.GROK_BRIDGE_CHILD, "1");
});

test("Muse dispatch uses a private prompt file, pins the launcher, and cleans up", async () => {
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  let invocation;
  let promptPath;
  let promptText;
  let promptMode;
  const museSession = "01a13133-e061-7931-8c96-0837aa59f1fb";
  const envelope = (type, payload) =>
    JSON.stringify({
      schema_version: 1,
      stream: { kind: "session", id: museSession },
      payload_type: type,
      payload,
    });
  const result = await runLocal({
    to: "muse",
    cwd: "/tmp/repo",
    task: "Read $(literal) `whoami`.",
    requestId: session,
    execute: async (...args) => {
      invocation = args;
      promptPath = args[1][args[1].indexOf("--prompt-file") + 1];
      promptText = readFileSync(promptPath, "utf8");
      promptMode = statSync(promptPath).mode & 0o777;
      return {
        stdout: [
          envelope("run.output.delta", { kind: "run_output_delta", text: "Read it." }),
          envelope("run.terminal.completed", {
            kind: "run_terminal",
            terminal: "completed",
            text: "Read it.",
            reason: null,
          }),
        ].join("\n"),
      };
    },
  });
  assert.deepEqual(
    { status: result.status, session: result.session, provider: result.provider },
    { status: "completed", session: museSession, provider: "muse" },
  );
  assert.equal(invocation[0], "muse");
  assert.equal(invocation[1][0], "exec");
  assert.ok(invocation[1].includes("--disable-write"));
  assert.ok(!invocation[1].join(" ").includes("whoami"));
  assert.equal(invocation[2].input, "");
  assert.equal(invocation[2].env.GROK_BRIDGE_CHILD, "1");
  assert.equal(invocation[2].env.MUSE_NO_AUTO_UPDATE, "1");
  assert.equal(invocation[2].env.MUSE_LOGIN, "0");
  assert.match(promptText, /^HANDOFF_CHILD: grok-bridge /);
  assert.match(promptText, /TASK\nRead \$\(literal\) `whoami`\.\n$/);
  assert.equal(promptMode, 0o600);
  assert.ok(!existsSync(promptPath));
});

test("Muse failed run on nonzero exit is reported without leaking its reason", async () => {
  const error = Object.assign(new Error("nonzero"), {
    code: "PROCESS_EXIT",
    stdout: JSON.stringify({
      schema_version: 1,
      stream: { kind: "session", id: "01a13133-e061-7931-8c96-0837aa59f1fb" },
      payload_type: "run.terminal.failed",
      payload: {
        kind: "run_terminal",
        terminal: "failed",
        text: "",
        reason: "private provider detail",
      },
    }),
  });
  let promptPath;
  await assert.rejects(
    runLocal({
      to: "muse",
      cwd: "/tmp/repo",
      task: "check",
      requestId: session,
      execute: async (_, args) => {
        promptPath = args[args.indexOf("--prompt-file") + 1];
        throw error;
      },
    }),
    (e) =>
      e.code === "MUSE_PROVIDER_FAILED" &&
      !e.message.includes("private provider detail"),
  );
  const { existsSync } = await import("node:fs");
  assert.ok(!existsSync(promptPath));
});
