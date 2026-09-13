import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProcess } from "../src/process.js";

const node = process.execPath;

test("passes stdin and literal arguments without invoking a shell", async () => {
  const args = [
    "space here",
    "$(echo injected)",
    "; echo injected",
    "`echo injected`",
  ];
  const result = await runProcess(
    node,
    [
      "-e",
      'let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>input+=x);process.stdin.on("end",()=>console.log(JSON.stringify({input,args:process.argv.slice(1)})))',
      ...args,
    ],
    { input: "private prompt\nsecond line" },
  );
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    input: "private prompt\nsecond line",
    args,
  });
  assert.equal(result.stderr, "");
});

test("returns captured output with a safe nonzero error summary", async () => {
  await assert.rejects(
    runProcess(node, [
      "-e",
      'process.stdout.write("sensitive stdout");process.stderr.write("sensitive stderr");process.exitCode=7',
    ]),
    (error) => {
      assert.equal(error.code, "PROCESS_EXIT");
      assert.equal(error.exitCode, 7);
      assert.equal(error.stdout, "sensitive stdout");
      assert.equal(error.stderr, "sensitive stderr");
      assert.equal(error.message, "Process exited with code 7.");
      return true;
    },
  );
});

test("reports missing executables without leaking their supplied path", async () => {
  await assert.rejects(
    runProcess("/nonexistent/private-prompt-command", []),
    (error) => {
      assert.equal(error.code, "ENOENT");
      assert.equal(error.message, "Could not start process (ENOENT).");
      return true;
    },
  );
});

test("enforces one combined budget for stdout and stderr", async () => {
  await assert.rejects(
    runProcess(
      node,
      [
        "-e",
        'process.stdout.write("a".repeat(700));process.stderr.write("b".repeat(700));setInterval(()=>{},1000)',
      ],
      { maxOutputBytes: 1_024 },
    ),
    (error) => {
      assert.equal(error.code, "PROCESS_OUTPUT_LIMIT");
      assert.equal(
        Buffer.byteLength(error.stdout) + Buffer.byteLength(error.stderr),
        1_024,
      );
      return true;
    },
  );
});

test("keeps decoded invalid UTF-8 within the output budget", async () => {
  await assert.rejects(
    runProcess(node, ["-e", "process.stdout.write(Buffer.alloc(100,255))"], {
      maxOutputBytes: 8,
    }),
    (error) => {
      assert.equal(error.code, "PROCESS_OUTPUT_LIMIT");
      assert.ok(Buffer.byteLength(error.stdout) <= 8);
      return true;
    },
  );
});

test("terminates a process which ignores SIGTERM at its deadline", async () => {
  const started = Date.now();
  await assert.rejects(
    runProcess(
      node,
      ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
      { timeoutMs: 300 },
    ),
    { code: "PROCESS_TIMEOUT" },
  );
  assert.ok(Date.now() - started < 3_000);
});

test("cancels a running process", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    await assert.rejects(
      runProcess(node, ["-e", "setInterval(()=>{},1000)"], {
        signal: controller.signal,
      }),
      { code: "PROCESS_ABORTED" },
    );
  } finally {
    clearTimeout(timer);
  }
});

test("does not spawn an already-cancelled command", async () => {
  await assert.rejects(
    runProcess("/nonexistent/command", [], { signal: AbortSignal.abort() }),
    { code: "PROCESS_ABORTED" },
  );
});

test("accepts successful commands that close stdin before consuming it", async () => {
  const result = await runProcess(
    node,
    ["-e", 'process.stdin.destroy();console.log("done")'],
    { input: "x".repeat(4_000_000) },
  );
  assert.equal(result.stdout, "done\n");
});

test("clears cancellation handlers and deadline after completion", async () => {
  const controller = new AbortController();
  const result = await runProcess(node, ["-e", 'console.log("done")'], {
    signal: controller.signal,
    timeoutMs: 300,
  });
  controller.abort();
  assert.equal(result.stdout, "done\n");
});

test("rejects invalid process bounds", async () => {
  await assert.rejects(runProcess(node, [], { timeoutMs: 0 }), {
    code: "PROCESS_INVALID_ARGUMENT",
  });
  await assert.rejects(runProcess(node, [], { maxOutputBytes: -1 }), {
    code: "PROCESS_INVALID_ARGUMENT",
  });
  await assert.rejects(runProcess(node, [], { signal: {} }), {
    code: "PROCESS_INVALID_ARGUMENT",
  });
});

test(
  "kills a descendant that inherits pipes after its parent exits",
  { skip: process.platform === "win32" },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "grok-bridge-process-"));
    const heartbeatPath = path.join(dir, "heartbeat");
    const descendant =
      'const fs=require("node:fs");process.on("SIGTERM",()=>{});setInterval(()=>fs.appendFileSync(process.argv[1],"x"),20)';
    const parent =
      'const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e",process.argv[1],process.argv[2]],{stdio:["ignore","inherit","inherit"]});console.log(c.pid);setTimeout(()=>process.exit(0),150)';
    const result = await runProcess(
      node,
      ["-e", parent, descendant, heartbeatPath],
      { timeoutMs: 2_000 },
    );
    assert.equal(result.exitCode, 0);
    const pid = Number(result.stdout.trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    const before = await readFile(heartbeatPath, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await readFile(heartbeatPath, "utf8"), before);
    try {
      process.kill(pid, 0);
      const result = await runProcess("ps", ["-o", "stat=", "-p", String(pid)]);
      assert.match(result.stdout, /^Z/);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  },
);
