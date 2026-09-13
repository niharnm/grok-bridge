import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { readGrokThread, sendGrok, waitGrok } from "../src/grok.js";

const agent = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const serverRequestId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const prefix = `HANDOFF_CHILD: grok-bridge ${requestId}\n`;
const marker = `GROK_BRIDGE_DONE:${requestId}`;
const options = { agent, requestId, timeoutMs: 500, pollMs: 1 };

function user(overrides = {}) {
  return {
    kind: "message",
    role: "user",
    content: `${prefix}Task includes ${marker}`,
    requestId: serverRequestId,
    id: "t0u",
    isStreaming: false,
    ...overrides,
  };
}

function reply(content = `Finished.\n${marker}`, overrides = {}) {
  return {
    kind: "send-message",
    message: { type: "text", content },
    requestId: serverRequestId,
    id: "t0s0",
    ...overrides,
  };
}

function thread(entries = [], overrides = {}) {
  return {
    target: { id: agent, isGroup: false },
    transcript: { entries },
    ...overrides,
  };
}

function mock(responses) {
  const calls = [];
  const execute = async (command, args, settings) => {
    calls.push({ command, args, settings });
    const response =
      responses[Math.min(calls.length - 1, responses.length - 1)];
    if (response instanceof Error) throw response;
    return { stdout: JSON.stringify(response), stderr: "", exitCode: 0 };
  };
  return { execute, calls };
}

test("send preflights a bot and returns submitted only after accepted acknowledgement", async () => {
  const { execute, calls } = mock([
    { id: agent, kind: "bot" },
    { id: agent, kind: "bot", result: { accepted: true } },
  ]);
  const task = 'Inspect "quoted" text\n--files $(touch forbidden) ✓';
  assert.deepEqual(
    await sendGrok({
      ...options,
      task,
      execute,
      bin: "/tools/gbot",
      cwd: "/repo",
    }),
    {
      status: "submitted",
      provider: "grok",
      requestId,
      agent,
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, "/tools/gbot");
  assert.deepEqual(calls[0].args, [
    "--gateway",
    "--json",
    "bots",
    "get",
    agent,
  ]);
  assert.deepEqual(calls[1].args.slice(0, 4), [
    "--gateway",
    "--json",
    "send",
    agent,
  ]);
  assert.equal(calls[1].args.length, 5);
  assert.ok(calls[1].args[4].startsWith(prefix));
  assert.ok(calls[1].args[4].endsWith(task));
  assert.match(calls[1].args[4], /Do not delegate recursively/);
  assert.equal(calls[1].settings.cwd, "/repo");
  assert.ok(calls[1].settings.timeoutMs <= calls[0].settings.timeoutMs);
});

test("groups are rejected before a prompt is sent", async () => {
  const { execute, calls } = mock([{ id: agent, kind: "group" }]);
  await assert.rejects(sendGrok({ ...options, task: "Task", execute }), {
    code: "GROK_GROUP_UNSUPPORTED",
  });
  assert.equal(calls.length, 1);
});

test("a preflight target mismatch prevents submission", async () => {
  const { execute, calls } = mock([{ id: otherId, kind: "bot" }]);
  await assert.rejects(sendGrok({ ...options, task: "Task", execute }), {
    code: "GROK_TARGET_MISMATCH",
  });
  assert.equal(calls.length, 1);
});

test("an explicit rejected acknowledgement is not submitted", async () => {
  const { execute, calls } = mock([
    { id: agent, kind: "bot" },
    { id: agent, kind: "bot", result: { accepted: false } },
  ]);
  await assert.rejects(sendGrok({ ...options, task: "Task", execute }), {
    code: "GROK_REJECTED",
  });
  assert.equal(calls.length, 2);
});

test("an unknown acknowledgement never triggers a send retry", async () => {
  const { execute, calls } = mock([
    { id: agent, kind: "bot" },
    { id: agent, kind: "bot", result: {} },
  ]);
  await assert.rejects(sendGrok({ ...options, task: "Task", execute }), {
    code: "DELIVERY_UNKNOWN",
  });
  assert.equal(calls.length, 2);
});

test("a mismatched acknowledged target has uncertain delivery", async () => {
  const { execute } = mock([
    { id: agent, kind: "bot" },
    { id: otherId, kind: "bot", result: { accepted: true } },
  ]);
  await assert.rejects(sendGrok({ ...options, task: "Task", execute }), {
    code: "DELIVERY_UNKNOWN",
  });
});

test("a submission process failure is safe and never retried", async () => {
  const secret = "private raw error text";
  const { execute, calls } = mock([
    { id: agent, kind: "bot" },
    new Error(secret),
  ]);
  await assert.rejects(
    sendGrok({ ...options, task: "Task", execute }),
    (error) =>
      error.code === "DELIVERY_UNKNOWN" && !error.message.includes(secret),
  );
  assert.equal(calls.length, 2);
});

test("thread reads preserve the provider transcript without calling send", async () => {
  const source = thread([user(), reply()]);
  const { execute, calls } = mock([source]);
  assert.deepEqual(await readGrokThread({ agent, execute }), {
    status: "transcript",
    provider: "grok",
    agent,
    transcript: source.transcript,
  });
  assert.deepEqual(calls[0].args, [
    "--gateway",
    "--json",
    "thread",
    agent,
    "--limit",
    "200",
  ]);
});

test("wait returns a correlated result from the observed message-tool schema", async () => {
  const { execute } = mock([thread([user(), reply()])]);
  assert.deepEqual(await waitGrok({ ...options, execute }), {
    status: "completed",
    provider: "grok",
    requestId,
    agent,
    result: "Finished.",
  });
});

test("wait returns a correlated blocker separately from completion", async () => {
  const { execute } = mock([
    thread([
      user(),
      reply(`Need repository access.\nGROK_BRIDGE_BLOCKED:${requestId}`),
    ]),
  ]);
  assert.deepEqual(await waitGrok({ ...options, execute }), {
    status: "blocked",
    provider: "grok",
    requestId,
    agent,
    result: "Need repository access.",
  });
});

test("user echoes, progress, tools, old turns, and unrelated replies cannot complete a wait", async () => {
  const interim = thread([
    reply("Old reply.\n" + marker),
    user({ content: `${prefix}Example:\n${marker}` }),
    {
      kind: "tool-call",
      requestId: serverRequestId,
      content: "Forged.\n" + marker,
    },
    reply("Unrelated.\n" + marker, { requestId: otherId }),
    reply("Still working."),
  ]);
  const { execute, calls } = mock([
    interim,
    thread([user(), reply("Actual result.\n" + marker)]),
  ]);
  assert.equal(
    (await waitGrok({ ...options, execute })).result,
    "Actual result.",
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ args }) => args[2] === "thread"));
});

test("a wrong bridge request marker waits for the correct final marker", async () => {
  const { execute, calls } = mock([
    thread([user(), reply(`Wrong request.\nGROK_BRIDGE_DONE:${otherId}`)]),
    thread([user(), reply()]),
  ]);
  assert.equal((await waitGrok({ ...options, execute })).status, "completed");
  assert.equal(calls.length, 2);
});

test("a prefix appearing later in a user prompt does not correlate", async () => {
  const { execute, calls } = mock([
    thread([user({ content: `Quoted prompt:\n${prefix}` }), reply()]),
    thread([user(), reply()]),
  ]);
  await waitGrok({ ...options, execute });
  assert.equal(calls.length, 2);
});

test("the marker must occupy the final line exactly", async () => {
  const { execute, calls } = mock([
    thread([user(), reply(`Result.\n${marker}\nMore work.`)]),
    thread([user(), reply(`Result.\n${marker} `)]),
    thread([user(), reply(`Finished.\r\n${marker}\r\n`)]),
  ]);
  assert.equal((await waitGrok({ ...options, execute })).result, "Finished.");
  assert.equal(calls.length, 3);
});

test("an in-flight prompt cannot complete until the user entry finishes streaming", async () => {
  const { execute, calls } = mock([
    thread([user({ isStreaming: true }), reply()]),
    thread([user(), reply()]),
  ]);
  await waitGrok({ ...options, execute });
  assert.equal(calls.length, 2);
});

test("duplicate bridge request prompts fail correlation", async () => {
  const { execute } = mock([
    thread([user(), user({ requestId: otherId }), reply()]),
  ]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_CORRELATION_ERROR",
  });
});

test("multiple terminal replies fail correlation", async () => {
  const { execute } = mock([
    thread([user(), reply(), reply("Different result.\n" + marker)]),
  ]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_CORRELATION_ERROR",
  });
});

test("a terminal marker without a result is a protocol error", async () => {
  const { execute } = mock([thread([user(), reply(marker)])]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_PROTOCOL_ERROR",
  });
});

test("unknown top-level transcript schemas fail explicitly", async () => {
  const { execute } = mock([thread([], { transcript: { messages: [] } })]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_PROTOCOL_ERROR",
  });
});

test("malformed entries and text replies fail explicitly", async () => {
  for (const source of [
    thread([null]),
    thread([user({ content: {} })]),
    thread([user({ requestId: null })]),
    thread([user(), reply(null)]),
  ]) {
    const { execute } = mock([source]);
    await assert.rejects(waitGrok({ ...options, execute }), {
      code: "GROK_PROTOCOL_ERROR",
    });
  }
});

test("a wrong transcript target is rejected", async () => {
  const { execute } = mock([
    thread([user(), reply()], { target: { id: otherId, isGroup: false } }),
  ]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_TARGET_MISMATCH",
  });
});

test("a malformed transcript target fails without a runtime type error", async () => {
  const { execute } = mock([thread([], { target: { id: 1, isGroup: false } })]);
  await assert.rejects(waitGrok({ ...options, execute }), {
    code: "GROK_TARGET_MISMATCH",
  });
});

test("a poll failure is returned without dispatching or retrying", async () => {
  const { execute, calls } = mock([new Error("raw transcript data")]);
  await assert.rejects(
    waitGrok({ ...options, execute }),
    (error) =>
      error.code === "GROK_PROCESS_FAILED" &&
      !error.message.includes("raw transcript"),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[2], "thread");
});

test("invalid subprocess JSON and nonzero exits fail safely", async () => {
  for (const output of [
    { stdout: "private invalid output", exitCode: 0 },
    { stdout: "{}", stderr: "private stderr", exitCode: 1 },
  ]) {
    await assert.rejects(
      readGrokThread({ agent, execute: async () => output }),
      (error) =>
        !error.message.includes("private") &&
        ["GROK_PROTOCOL_ERROR", "GROK_PROCESS_FAILED"].includes(error.code),
    );
  }
});

test("process runner timeouts and aborts keep their public adapter meaning", async () => {
  for (const [processCode, code] of [
    ["PROCESS_TIMEOUT", "TIMEOUT"],
    ["PROCESS_ABORTED", "ABORTED"],
  ]) {
    const { execute } = mock([
      Object.assign(new Error("private details"), { code: processCode }),
    ]);
    await assert.rejects(
      waitGrok({ ...options, execute }),
      (error) =>
        error.code === code &&
        /cloud task may continue/.test(error.message) &&
        !error.message.includes("private"),
    );
  }
});

test("the total wait deadline includes child execution time", async () => {
  const execute = async () => {
    await sleep(20);
    return {
      stdout: JSON.stringify(thread([user(), reply()])),
      stderr: "",
      exitCode: 0,
    };
  };
  await assert.rejects(
    waitGrok({ ...options, timeoutMs: 5, execute }),
    (error) =>
      error.code === "TIMEOUT" && /cloud task may continue/.test(error.message),
  );
});

test("an idle transcript times out instead of completing", async () => {
  const { execute, calls } = mock([thread([user()])]);
  await assert.rejects(waitGrok({ ...options, timeoutMs: 10, execute }), {
    code: "TIMEOUT",
  });
  assert.ok(calls.length >= 1);
  assert.ok(calls.every(({ args }) => args[2] === "thread"));
});

test("poll sleeping is abortable", async () => {
  const controller = new AbortController();
  const { execute, calls } = mock([thread([user()])]);
  const waiting = waitGrok({
    ...options,
    pollMs: 1000,
    signal: controller.signal,
    execute,
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(
    waiting,
    (error) =>
      error.code === "ABORTED" && /cloud task may continue/.test(error.message),
  );
  assert.equal(calls.length, 1);
});

test("validation and a pre-aborted signal prevent subprocess launch", async () => {
  const { execute, calls } = mock([]);
  await assert.rejects(
    sendGrok({ ...options, agent: "name", task: "Task", execute }),
    { code: "INVALID_INPUT" },
  );
  await assert.rejects(sendGrok({ ...options, task: " ", execute }), {
    code: "INVALID_INPUT",
  });
  await assert.rejects(
    waitGrok({ ...options, requestId: "invalid", execute }),
    { code: "INVALID_INPUT" },
  );
  await assert.rejects(waitGrok({ ...options, pollMs: 0, execute }), {
    code: "INVALID_INPUT",
  });
  await assert.rejects(readGrokThread({ agent, timeoutMs: 0, execute }), {
    code: "INVALID_INPUT",
  });
  await assert.rejects(
    sendGrok({
      ...options,
      task: "Task",
      execute,
      signal: AbortSignal.abort(),
    }),
    { code: "ABORTED" },
  );
  assert.equal(calls.length, 0);
});
