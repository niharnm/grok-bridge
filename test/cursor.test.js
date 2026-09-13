import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { cursorArguments, parseCursor } from "../src/cursor.js";

const cwd = resolve("workspace with spaces");
const session = "11111111-1111-4111-8111-111111111111";
const success = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Inspected the requested code.",
  session_id: session,
  duration_ms: 1234,
  duration_api_ms: 1234,
};

test("Cursor review requests ask mode, JSON, and the existing workspace sandbox", () => {
  const args = cursorArguments({ cwd, input: "Review the requested change." });
  assert.deepEqual(args, [
    "--print",
    "--output-format",
    "json",
    "--workspace",
    cwd,
    "--sandbox",
    "enabled",
    "--mode",
    "ask",
    "--",
    "Review the requested change.",
  ]);
  for (const flag of [
    "--force",
    "--yolo",
    "--trust",
    "--approve-mcps",
    "--continue",
    "--worktree",
  ]) {
    assert.ok(!args.includes(flag));
  }
});

test("explicit Cursor work enables changes while retaining the sandbox", () => {
  const args = cursorArguments({
    cwd,
    mode: "work",
    input: "Fix the scoped bug.",
  });
  assert.ok(args.includes("--force"));
  assert.deepEqual(
    args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2),
    ["--sandbox", "enabled"],
  );
  assert.ok(!args.includes("--mode"));
  assert.ok(!args.includes("--trust"));
  assert.ok(!args.includes("--approve-mcps"));
});

test("Cursor preserves one literal positional prompt after the option separator", () => {
  const input =
    '--force $(touch forbidden) `whoami` "quoted text"\nNext line; no shell.';
  const args = cursorArguments({ cwd, input });
  assert.deepEqual(args.slice(-2), ["--", input]);
  assert.equal(args.filter((arg) => arg === input).length, 1);
  assert.ok(!args.includes("--force"));
});

test("Cursor resumes only the explicit UUID and forwards the chosen model", () => {
  const args = cursorArguments({
    cwd,
    session,
    model: "composer-2.5",
    input: "Continue this task.",
  });
  assert.deepEqual(args.slice(-6), [
    "--resume",
    session,
    "--model",
    "composer-2.5",
    "--",
    "Continue this task.",
  ]);
  assert.ok(!args.includes("--continue"));
});

test("invalid Cursor arguments fail before execution without including supplied data", () => {
  for (const change of [
    { cwd: "relative/private" },
    { cwd: null },
    { mode: "unsafe" },
    { session: "latest" },
    { session: "" },
    { model: "" },
    { model: 123 },
    { model: "secret\0model" },
    { input: "" },
    { input: " " },
    { input: "secret\0prompt" },
  ]) {
    assert.throws(
      () => cursorArguments({ cwd, input: "Task", ...change }),
      (error) => {
        assert.equal(error.code, "CURSOR_INVALID_INPUT");
        assert.ok(!error.message.includes("secret"));
        assert.ok(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("Cursor parses the documented terminal result and preserves its native session", () => {
  assert.deepEqual(parseCursor(JSON.stringify(success)), {
    status: "completed",
    session,
    result: "Inspected the requested code.",
  });
  assert.equal(
    parseCursor(
      JSON.stringify({ ...success, request_id: "optional-provider-request" }),
    ).session,
    session,
  );
});

test("Cursor does not treat messages or invalid JSON as terminal completion", () => {
  for (const text of [
    "",
    "private invalid JSON",
    "null",
    "[]",
    JSON.stringify({ type: "assistant", message: "done" }),
    `${JSON.stringify(success)}\n${JSON.stringify(success)}`,
  ]) {
    assert.throws(
      () => parseCursor(text),
      (error) => {
        assert.equal(error.code, "CURSOR_PROTOCOL_ERROR");
        assert.ok(!error.message.includes("private"));
        return true;
      },
    );
  }
});

test("Cursor requires explicit successful status, final text, and a session UUID", () => {
  for (const change of [
    { is_error: undefined },
    { is_error: "false" },
    { subtype: undefined },
    { result: "" },
    { result: " " },
    { result: null },
    { session_id: "" },
    { session_id: "latest" },
    { session_id: undefined },
  ]) {
    assert.throws(
      () => parseCursor(JSON.stringify({ ...success, ...change })),
      { code: "CURSOR_PROTOCOL_ERROR" },
    );
  }
});

test("Cursor rejects provider failures without exposing provider text", () => {
  for (const change of [{ is_error: true }, { subtype: "error_max_turns" }]) {
    assert.throws(
      () =>
        parseCursor(
          JSON.stringify({
            ...success,
            result: "private provider detail",
            ...change,
          }),
        ),
      (error) => {
        assert.equal(error.code, "CURSOR_PROVIDER_FAILED");
        assert.ok(!error.message.includes("private provider detail"));
        return true;
      },
    );
  }
});

test("a successful Cursor turn is reported without inventing file-change evidence", () => {
  const result = parseCursor(
    JSON.stringify({
      ...success,
      result: "I proposed a change but did not edit files.",
    }),
  );
  assert.equal(result.status, "completed");
  assert.equal(result.result, "I proposed a change but did not edit files.");
  assert.deepEqual(Object.keys(result).sort(), ["result", "session", "status"]);
});
