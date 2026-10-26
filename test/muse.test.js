import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { museArguments, parseMuse } from "../src/muse.js";

const cwd = resolve("workspace with spaces");
const promptFile = resolve("prompt dir", "task.txt");
const session = "01a13133-e061-7931-8c96-0837aa59f1fb";
const otherSession = "22222222-2222-4222-8222-222222222222";

function event(type, payload, { kind = "session", id = session } = {}) {
  return {
    schema_version: 1,
    id: "018f0000-0000-7000-8000-00000000c350",
    stream: { kind, id },
    sequence: 1,
    recorded_at: 1780531400000000,
    record_type: "event",
    durability: "durable",
    causation_id: "2de2477b-b282-4c07-bc8d-0283d5ad8be8",
    payload_type: type,
    payload_schema_version: 1,
    payload,
  };
}
const accepted = event("runtime.command.accepted", {
  kind: "command_accepted",
  command_kind: "turn.submit",
});
const task = event("task.lifecycle.started", {
  kind: "task_lifecycle",
  task_id: "01a13133-e0c4-73d2-999d-8eb3cdbb275b",
  event: { kind: "started" },
});
const delta = (text) =>
  event("run.output.delta", { kind: "run_output_delta", text });
const terminal = (kind = "completed", text = "Inspected the fixture.\n") =>
  event(`run.terminal.${kind}`, {
    kind: "run_terminal",
    terminal: kind,
    text,
    reason: null,
  });
const stream = (...events) =>
  `${events.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n")}\n`;

test("Muse review disables writes and shell with approvals off and the sandbox kept", () => {
  const args = museArguments({ cwd, promptFile });
  assert.deepEqual(args, [
    "exec",
    "--json",
    "--prompt-file",
    promptFile,
    "--workspace",
    cwd,
    "--approval-mode",
    "never",
    "--sandbox-network",
    "proxy-only",
    "--contributor-mode",
    "off",
    "--no-foreign-personal-context",
    "--disable-request-user-input",
    "--disable-web-tools",
    "--disable-write",
    "--disable-shell",
  ]);
  for (const flag of [
    "--yolo",
    "--disable-sandbox",
    "--disable-approval",
    "--trust-workspace",
    "--allow-workspace-switch",
    "--no-session-log",
    "--api-key-stdin",
  ]) {
    assert.ok(!args.includes(flag), flag);
  }
});

test("Muse work keeps the native sandbox and never adds a bypass", () => {
  const args = museArguments({ cwd, promptFile, mode: "work" });
  assert.ok(!args.includes("--disable-write"));
  assert.ok(!args.includes("--disable-shell"));
  assert.ok(!args.includes("--yolo"));
  assert.ok(!args.includes("--disable-sandbox"));
  assert.ok(!args.includes("--trust-workspace"));
  assert.equal(args[args.indexOf("--approval-mode") + 1], "never");
  assert.equal(args[args.indexOf("--sandbox-network") + 1], "proxy-only");
});

test("Muse resumes only the supplied session and chosen model", () => {
  const args = museArguments({ cwd, promptFile, session, model: "chosen" });
  assert.deepEqual(args.slice(-4), ["--session-id", session, "--model", "chosen"]);
  assert.ok(!args.includes("--last"));
  assert.ok(!args.includes("resume"));
});

test("Muse rejects invalid arguments before execution without exposing them", () => {
  for (const change of [
    { cwd: "relative/private" },
    { cwd: null },
    { cwd: "/secret\0path" },
    { promptFile: "relative/private.txt" },
    { promptFile: undefined },
    { promptFile: "/secret\0task" },
    { mode: "unsafe" },
    { session: "latest" },
    { session: "" },
    { session: null },
    { model: "" },
    { model: 7 },
    { model: "secret\0model" },
  ]) {
    assert.throws(
      () => museArguments({ cwd, promptFile, ...change }),
      (error) => {
        assert.equal(error.code, "MUSE_INVALID_INPUT");
        assert.ok(!error.message.includes("secret"));
        assert.ok(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("Muse keeps the session and prefers the terminal text over streamed deltas", () => {
  assert.deepEqual(
    parseMuse(stream(accepted, task, delta("Partial."), terminal())),
    { status: "completed", session, result: "Inspected the fixture.\n" },
  );
  assert.deepEqual(
    parseMuse(stream(accepted, delta("Part one. "), delta("Part two."), terminal("completed", null))),
    { status: "completed", session, result: "Part one. Part two." },
  );
});

test("Muse ignores unknown payload types and run-stream envelopes", () => {
  const unknown = event("future.payload.type", { kind: "future" });
  const runStream = event(
    "run.lifecycle.started",
    { kind: "run_started" },
    { kind: "run", id: "2de2477b-b282-4c07-bc8d-0283d5ad8be8" },
  );
  assert.equal(
    parseMuse(stream(unknown, runStream, terminal())).status,
    "completed",
  );
});

test("Muse rejects malformed output without exposing its contents", () => {
  for (const text of [
    undefined,
    "",
    "private invalid JSON",
    "null\n",
    "[]\n",
    "{}\n",
    stream({ ...terminal(), stream: { kind: "session" } }),
    stream({ ...terminal(), payload: "private" }),
    stream({ ...terminal(), payload_type: "" }),
    stream({ ...terminal(), schema_version: "1" }),
    stream(accepted, delta("private partial")),
    stream(event("run.terminal.completed", { kind: "run_terminal", terminal: "completed" }, { id: "not-a-uuid" })),
  ]) {
    assert.throws(
      () => parseMuse(text),
      (error) => {
        assert.equal(error.code, "MUSE_PROTOCOL_ERROR");
        assert.ok(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("Muse rejects duplicate, mismatched, unrelated, or out-of-order records", () => {
  const foreign = event(
    "run.output.delta",
    { kind: "run_output_delta", text: "x" },
    { id: otherSession },
  );
  for (const events of [
    [terminal(), terminal()],
    [terminal(), delta("late")],
    [accepted, foreign, terminal()],
    [event("run.terminal.completed", { kind: "run_terminal", terminal: "failed", text: "" })],
    [event("run.terminal.completed", { kind: "run_terminal", terminal: "" })],
    [event("run.terminal.completed", { kind: "other", terminal: "completed" })],
    [event("run.terminal.completed", { kind: "run_terminal", terminal: "completed", text: 5 })],
    [event("run.terminal.completed", { kind: "run_terminal", terminal: "completed", text: "ok", reason: 5 })],
    [event("run.output.delta", { kind: "run_output_delta", text: 5 }), terminal()],
    [event("run.output.delta", { kind: "other", text: "x" }), terminal()],
  ]) {
    assert.throws(() => parseMuse(stream(...events)), {
      code: "MUSE_PROTOCOL_ERROR",
    });
  }
});

test("Muse requires a session envelope and nonempty final text", () => {
  const runOnly = event(
    "run.terminal.completed",
    { kind: "run_terminal", terminal: "completed", text: "done" },
    { kind: "run", id: "2de2477b-b282-4c07-bc8d-0283d5ad8be8" },
  );
  assert.throws(() => parseMuse(stream(runOnly)), {
    code: "MUSE_PROTOCOL_ERROR",
  });
  for (const text of ["", " ", null]) {
    assert.throws(() => parseMuse(stream(accepted, terminal("completed", text))), {
      code: "MUSE_PROTOCOL_ERROR",
    });
  }
  const withoutText = event("run.terminal.completed", {
    kind: "run_terminal",
    terminal: "completed",
  });
  assert.throws(() => parseMuse(stream(accepted, withoutText)), {
    code: "MUSE_PROTOCOL_ERROR",
  });
});

test("Muse does not accept failed, cancelled, or other non-completed runs", () => {
  for (const kind of ["failed", "cancelled", "interrupted", "max_steps"]) {
    assert.throws(
      () =>
        parseMuse(
          stream(
            accepted,
            delta("private partial"),
            event(`run.terminal.${kind}`, {
              kind: "run_terminal",
              terminal: kind,
              text: "",
              reason: "private provider detail",
            }),
          ),
        ),
      (error) => {
        assert.equal(error.code, "MUSE_PROVIDER_FAILED");
        assert.ok(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("a headless approval wait blocks even a completed run and preserves its text", () => {
  const wait = event("approval_wait.effect.started", {
    kind: "approval_wait_effect",
    run_id: "2de2477b-b282-4c07-bc8d-0283d5ad8be8",
    record: {
      kind: "pending",
      pending_action_id: "a",
      task_id: "t",
      tool_call_id: "c",
      tool_name: "private_tool",
    },
  });
  for (const text of ["", "The command needs approval."]) {
    const result = parseMuse(stream(accepted, wait, terminal("completed", text)));
    assert.equal(result.status, "blocked");
    assert.equal(result.session, session);
    assert.equal(result.result, text);
    assert.match(result.reason, /approval/);
    assert.ok(!JSON.stringify(result).includes("private_tool"));
  }
  assert.throws(
    () =>
      parseMuse(
        stream(
          accepted,
          wait,
          event("run.terminal.failed", {
            kind: "run_terminal",
            terminal: "failed",
            text: "",
          }),
        ),
      ),
    { code: "MUSE_PROVIDER_FAILED" },
  );
});

test("successful tool output is not mistaken for a block based on quoted text", () => {
  const tool = event("tool.result", {
    kind: "tool_result",
    call_id: "c",
    text: "Documentation mentions approval_wait and permission denied errors.",
    correlation_facts: { tool_name: "read_file", outcome: "ok" },
  });
  assert.equal(parseMuse(stream(accepted, tool, terminal())).status, "completed");
});
