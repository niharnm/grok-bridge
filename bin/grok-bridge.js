#!/usr/bin/env node
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { runLocal, localBinaries } from "../src/local.js";
import { sendGrok, readGrokThread, waitGrok } from "../src/grok.js";
import { runProcess } from "../src/process.js";

const help = `grok-bridge: one CLI for Grok Bot, Codex, Claude Code, Cursor, and Antigravity

  grok-bridge run --to codex|claude|cursor|antigravity --cwd /absolute/repo --task-file task.txt
      [--mode review|work] [--session UUID] [--model MODEL] [--timeout 600]
  grok-bridge send --agent UUID --task-file task.txt [--wait] [--timeout 600]
  grok-bridge wait --agent UUID --request UUID [--timeout 600] [--poll-interval 2]
  grok-bridge thread --agent UUID
  grok-bridge doctor [--to codex|claude|cursor|antigravity|grok]

Use --task-file - to read stdin. review is the default; work explicitly allows edits.
All commands emit JSON. send acknowledges submission; wait requires a correlated final reply.
Timeout or Ctrl-C during a Grok wait does not stop the cloud Bot. No send is retried.
Native CLI sessions retain history. The bridge stores no transcript or credentials.
Cursor work auto-approves commands with --force inside its enabled sandbox; native deny rules apply.
Antigravity review requests plan mode; that mode is not a hard read-only boundary.
Set GROK_BRIDGE_CODEX_BIN, GROK_BRIDGE_CLAUDE_BIN, GROK_BRIDGE_CURSOR_BIN,
GROK_BRIDGE_ANTIGRAVITY_BIN, or GROK_BRIDGE_GBOT_BIN to an executable path.
`;

const definitions = {
  to: { type: "string" },
  cwd: { type: "string" },
  mode: { type: "string" },
  session: { type: "string" },
  model: { type: "string" },
  agent: { type: "string" },
  request: { type: "string" },
  "task-file": { type: "string" },
  timeout: { type: "string" },
  "poll-interval": { type: "string" },
  wait: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};
const allowed = {
  run: ["to", "cwd", "mode", "session", "model", "task-file", "timeout"],
  send: ["agent", "task-file", "wait", "timeout", "poll-interval"],
  wait: ["agent", "request", "timeout", "poll-interval"],
  thread: ["agent", "timeout"],
  doctor: ["to"],
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const controller = new AbortController();
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    controller.abort();
  });
const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function seconds(value, fallback, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0.1 || n > 86400)
    throw new Error(`${name} must be between 0.1 and 86400 seconds.`);
  return Math.ceil(n * 1000);
}

function identifier(value, name) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new Error(`${name} must be an explicit UUID.`);
  return value;
}

async function taskText(path, timeoutMs) {
  if (!path) throw new Error("--task-file is required. Use - for stdin.");
  const maxBytes = 64 * 1024;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([controller.signal, timeout]);
  let text;
  try {
    if (path === "-") {
      if (process.stdin.isTTY)
        throw new Error("Pipe the task into stdin or provide a task file.");
      const chunks = [];
      let size = 0;
      const abortInput = () =>
        process.stdin.destroy(new Error("Task input interrupted."));
      signal.addEventListener("abort", abortInput, { once: true });
      try {
        signal.throwIfAborted();
        for await (const chunk of process.stdin) {
          size += chunk.length;
          if (size > maxBytes)
            throw new Error(
              "Task exceeds 64 KiB. Send a smaller, scoped handoff.",
            );
          chunks.push(chunk);
        }
      } finally {
        signal.removeEventListener("abort", abortInput);
      }
      text = Buffer.concat(chunks).toString("utf8");
    } else {
      const info = await stat(path);
      if (!info.isFile() || info.size > maxBytes)
        throw new Error("Task must be a regular file of at most 64 KiB.");
      text = await readFile(path, { encoding: "utf8", signal });
    }
  } catch (error) {
    if (timeout.aborted)
      throw Object.assign(new Error("Task input exceeded its time limit."), {
        code: "TIMEOUT",
      });
    throw error;
  }
  if (!text.trim() || text.includes("\0") || Buffer.byteLength(text) > maxBytes)
    throw new Error(
      "Task must be nonempty text of at most 64 KiB without NUL bytes.",
    );
  return text;
}

async function doctor(to) {
  const targets = to ? [to] : [...Object.keys(localBinaries), "grok"];
  if (targets.some((p) => p !== "grok" && !Object.hasOwn(localBinaries, p)))
    throw new Error(
      "--to must be codex, claude, cursor, antigravity, or grok.",
    );
  const checks = await Promise.all(
    targets.map(async (provider) => {
      const bin =
        process.env[
          `GROK_BRIDGE_${provider === "grok" ? "GBOT" : provider.toUpperCase()}_BIN`
        ] || (provider === "grok" ? "gbot" : localBinaries[provider]);
      try {
        const output = await runProcess(
          bin,
          [provider === "grok" ? "--help" : "--version"],
          { timeoutMs: 15000, signal: controller.signal },
        );
        return {
          provider,
          executable: true,
          version:
            provider === "grok"
              ? "Run gbot from grok-bot-cli 0.2.3; --help responded."
              : output.stdout.trim(),
          authentication: "not_checked",
        };
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return {
          provider,
          executable: false,
          code: error.code || "FAILED",
          authentication: "not_checked",
        };
      }
    }),
  );
  return {
    status: checks.every((c) => c.executable) ? "ready" : "missing_executable",
    checks,
    note: "Executable checks only. Run a bounded task to verify provider access.",
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: definitions,
    allowPositionals: true,
    strict: true,
  });
  if (values.version) {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    print({ version: pkg.version });
    return;
  }
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  const [command] = positionals;
  if (!allowed[command] || positionals.length !== 1)
    throw new Error("Choose run, send, wait, thread, or doctor. See --help.");
  for (const key of Object.keys(values))
    if (!allowed[command].includes(key))
      throw new Error(`--${key} does not apply to ${command}.`);
  if (command === "doctor") {
    const result = await doctor(values.to);
    print(result);
    if (result.status !== "ready") process.exitCode = 1;
    return;
  }
  if (process.env.GROK_BRIDGE_CHILD === "1")
    throw new Error(
      "Recursive bridge invocation is blocked. Return the result to the parent.",
    );
  const timeoutMs = seconds(values.timeout, 600, "--timeout");
  const pollMs = seconds(values["poll-interval"], 2, "--poll-interval");
  if (values.mode && !["review", "work"].includes(values.mode))
    throw new Error("--mode must be review or work.");
  if (values.model !== undefined && !values.model.trim())
    throw new Error("--model must be nonempty.");
  const deadline = Date.now() + timeoutMs;
  const budget = () => {
    const value = deadline - Date.now();
    if (value <= 0)
      throw Object.assign(new Error("Task time limit expired."), {
        code: "TIMEOUT",
      });
    return value;
  };
  const options = { timeoutMs, signal: controller.signal };
  let result;
  if (command === "run") {
    if (!Object.hasOwn(localBinaries, values.to))
      throw new Error(
        "--to must be codex, claude, cursor, or antigravity for run. Use send for Grok Bot.",
      );
    if (!values.cwd || !isAbsolute(values.cwd))
      throw new Error(
        "--cwd must be an explicit absolute directory on the executing computer.",
      );
    const cwd = await realpath(values.cwd);
    if (!(await stat(cwd)).isDirectory())
      throw new Error("--cwd must name a directory.");
    const session =
      values.session !== undefined
        ? identifier(values.session, "--session")
        : undefined;
    const task = await taskText(values["task-file"], budget());
    const requestId = randomUUID();
    const bin =
      process.env[`GROK_BRIDGE_${values.to.toUpperCase()}_BIN`] ||
      localBinaries[values.to];
    result = await runLocal({
      ...options,
      timeoutMs: budget(),
      to: values.to,
      cwd,
      mode: values.mode || "review",
      session,
      model: values.model,
      task,
      requestId,
      bin,
    });
  } else {
    const agent = identifier(values.agent, "--agent");
    const bin = process.env.GROK_BRIDGE_GBOT_BIN || "gbot";
    const grokOptions = { ...options, agent, bin };
    if (command === "thread") result = await readGrokThread(grokOptions);
    else if (command === "wait")
      result = await waitGrok({
        ...grokOptions,
        requestId: identifier(values.request, "--request"),
        pollMs,
      });
    else {
      const task = await taskText(values["task-file"], budget());
      const requestId = randomUUID();
      result = await sendGrok({
        ...grokOptions,
        timeoutMs: budget(),
        task,
        requestId,
      });
      if (values.wait) {
        process.stderr.write(`${JSON.stringify(result)}\n`);
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error(
            `Submitted request ${requestId}; wait budget expired. The cloud Bot may continue. Use wait with this request ID.`,
          );
        result = await waitGrok({
          ...grokOptions,
          requestId,
          timeoutMs: remaining,
          pollMs,
        });
      }
    }
  }
  print(result);
  if (result.status === "blocked") process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  print({
    status: interrupted ? "interrupted" : "failed",
    code: error.code || "ERROR",
    error: error.message,
  });
  process.exitCode = interrupted ? 130 : 1;
}
