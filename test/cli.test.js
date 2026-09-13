import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/grok-bridge.js", import.meta.url));
function invoke(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, GROK_BRIDGE_CHILD: "", ...env },
  });
}

test("help and version work without provider credentials", () => {
  const help = invoke(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /one CLI/);
  assert.match(JSON.parse(invoke(["--version"]).stdout).version, /^0\.1\./);
});

test("invalid routes and unsafe ambiguity fail before launching", () => {
  for (const args of [
    ["run", "--to", "grok"],
    ["run", "--to", "codex", "--cwd", "."],
    ["send", "--agent", "a-bot-name"],
    [
      "wait",
      "--agent",
      "11111111-1111-4111-8111-111111111111",
      "--request",
      "latest",
    ],
    ["run", "--wat"],
    ["thread", "--wait"],
    ["send", "--timeout", "NaN"],
    ["run", "extra"],
  ]) {
    const r = invoke(args);
    assert.equal(r.status, 1, args.join(" "));
    assert.equal(JSON.parse(r.stdout).status, "failed");
  }
});

test("recursive provider invocation fails closed", () => {
  const r = invoke(
    ["send", "--agent", "11111111-1111-4111-8111-111111111111"],
    { GROK_BRIDGE_CHILD: "1" },
  );
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).error, /Recursive/);
});

test("an explicit empty session fails before task loading", () => {
  const result = invoke([
    "run",
    "--to",
    "cursor",
    "--cwd",
    process.cwd(),
    "--session",
    "",
    "--task-file",
    "/missing/task-file",
  ]);
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).error,
    /--session must be an explicit UUID/,
  );
});

test("doctor distinguishes executable presence from authentication", () => {
  const r = invoke(["doctor", "--to", "codex"], {
    GROK_BRIDGE_CODEX_BIN: "/nonexistent/grok-bridge-test-binary",
  });
  assert.equal(r.status, 1);
  const result = JSON.parse(r.stdout);
  assert.equal(result.status, "missing_executable");
  assert.equal(result.checks[0].authentication, "not_checked");
});

test("invalid polling options are rejected before task loading or submission", () => {
  const r = invoke([
    "send",
    "--agent",
    "11111111-1111-4111-8111-111111111111",
    "--task-file",
    "/missing/file",
    "--wait",
    "--poll-interval",
    "invalid",
  ]);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).error, /poll-interval/);
});

test("an open stdin pipe obeys the task timeout", async () => {
  const child = spawn(
    process.execPath,
    [
      cli,
      "send",
      "--agent",
      "11111111-1111-4111-8111-111111111111",
      "--task-file",
      "-",
      "--timeout",
      "0.1",
    ],
    { env: { ...process.env, GROK_BRIDGE_CHILD: "" }, timeout: 3000 },
  );
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  const [code] = await once(child, "close");
  assert.equal(code, 1);
  assert.equal(JSON.parse(stdout).code, "TIMEOUT");
});

test(
  "SIGINT interrupts open stdin without invoking a provider",
  { skip: process.platform === "win32" },
  async () => {
    const child = spawn(
      process.execPath,
      [
        cli,
        "send",
        "--agent",
        "11111111-1111-4111-8111-111111111111",
        "--task-file",
        "-",
      ],
      { env: { ...process.env, GROK_BRIDGE_CHILD: "" }, timeout: 3000 },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGINT"), 200);
    const [code] = await once(child, "close");
    clearTimeout(timer);
    assert.equal(code, 130);
    assert.equal(JSON.parse(stdout).status, "interrupted");
  },
);
