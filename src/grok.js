import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { runProcess } from "./process.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function validate(agent, timeoutMs, signal) {
  if (typeof agent !== "string" || !UUID.test(agent)) {
    throw failure("INVALID_INPUT", "Grok Bot requires an agent UUID.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw failure(
      "INVALID_INPUT",
      "Timeout must be a positive number of milliseconds.",
    );
  }
  if (signal?.aborted)
    throw failure(
      "ABORTED",
      "Grok operation aborted. A submitted cloud task may continue.",
    );
}

function remaining(deadline, signal) {
  if (signal?.aborted)
    throw failure(
      "ABORTED",
      "Grok operation aborted. A submitted cloud task may continue.",
    );
  const value = Math.ceil(deadline - performance.now());
  if (value <= 0)
    throw failure(
      "TIMEOUT",
      "Grok operation timed out. A submitted cloud task may continue.",
    );
  return value;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function callGrok({
  args,
  deadline,
  signal,
  bin,
  cwd,
  execute,
  submitting = false,
}) {
  let output;
  try {
    output = await execute(bin, ["--gateway", "--json", ...args], {
      cwd,
      signal,
      timeoutMs: remaining(deadline, signal),
    });
  } catch (error) {
    if (
      signal?.aborted ||
      error?.code === "ABORTED" ||
      error?.code === "PROCESS_ABORTED" ||
      error?.name === "AbortError"
    ) {
      throw failure(
        "ABORTED",
        "Grok operation aborted. A submitted cloud task may continue.",
      );
    }
    if (error?.code === "TIMEOUT" || error?.code === "PROCESS_TIMEOUT") {
      throw failure(
        "TIMEOUT",
        "Grok operation timed out. A submitted cloud task may continue.",
      );
    }
    throw failure(
      submitting ? "DELIVERY_UNKNOWN" : "GROK_PROCESS_FAILED",
      submitting
        ? "Grok Bot submission failed with uncertain delivery. Inspect its conversation before retrying."
        : "The gbot command failed. Check gbot installation and authentication.",
    );
  }
  remaining(deadline, signal);
  if (!output || output.exitCode !== 0) {
    throw failure(
      submitting ? "DELIVERY_UNKNOWN" : "GROK_PROCESS_FAILED",
      submitting
        ? "Grok Bot submission failed with uncertain delivery. Inspect its conversation before retrying."
        : "The gbot command failed. Check gbot installation and authentication.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    throw failure(
      submitting ? "DELIVERY_UNKNOWN" : "GROK_PROTOCOL_ERROR",
      submitting
        ? "Grok Bot returned an unreadable acknowledgement. Delivery is uncertain; inspect its conversation before retrying."
        : "gbot returned invalid JSON.",
    );
  }
  return parsed;
}

function validateTranscript(output, agent) {
  if (
    !object(output) ||
    !object(output.target) ||
    typeof output.target.id !== "string" ||
    output.target.id.toLowerCase() !== agent.toLowerCase()
  ) {
    throw failure(
      "GROK_TARGET_MISMATCH",
      "Grok Bot returned a different or missing agent ID.",
    );
  }
  if (output.target.isGroup !== false) {
    throw failure(
      "GROK_PROTOCOL_ERROR",
      "Expected an individual Grok Bot transcript. Groups are not supported.",
    );
  }
  if (!object(output.transcript) || !Array.isArray(output.transcript.entries)) {
    throw failure(
      "GROK_PROTOCOL_ERROR",
      "Unsupported Grok Bot transcript schema; expected transcript.entries.",
    );
  }
  for (const entry of output.transcript.entries) {
    if (!object(entry) || typeof entry.kind !== "string") {
      throw failure(
        "GROK_PROTOCOL_ERROR",
        "Unsupported Grok Bot transcript entry schema.",
      );
    }
    if (
      entry.kind === "message" &&
      entry.role === "user" &&
      typeof entry.content !== "string"
    ) {
      throw failure(
        "GROK_PROTOCOL_ERROR",
        "Unsupported Grok Bot user-message schema.",
      );
    }
  }
  return output.transcript;
}

async function fetchTranscript(options) {
  const output = await callGrok({
    ...options,
    args: ["thread", options.agent, "--limit", "200"],
  });
  return validateTranscript(output, options.agent);
}

function correlatedResult(transcript, requestId) {
  const prefix = `HANDOFF_CHILD: grok-bridge ${requestId}\n`;
  const users = transcript.entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.kind === "message" &&
        entry.role === "user" &&
        typeof entry.content === "string" &&
        entry.content.startsWith(prefix),
    );
  if (users.length > 1) {
    throw failure(
      "GROK_CORRELATION_ERROR",
      "More than one Grok Bot prompt matches this request ID.",
    );
  }
  if (users.length === 0) return null;
  const { entry: user, index } = users[0];
  if (
    typeof user.requestId !== "string" ||
    !UUID.test(user.requestId) ||
    typeof user.isStreaming !== "boolean"
  ) {
    throw failure(
      "GROK_PROTOCOL_ERROR",
      "Unsupported Grok Bot request correlation schema.",
    );
  }
  if (user.isStreaming) return null;

  const results = [];
  for (const entry of transcript.entries.slice(index + 1)) {
    if (entry.requestId !== user.requestId || entry.kind !== "send-message")
      continue;
    if (!object(entry.message) || typeof entry.message.type !== "string") {
      throw failure(
        "GROK_PROTOCOL_ERROR",
        "Unsupported Grok Bot reply schema.",
      );
    }
    if (entry.message.type !== "text") continue;
    if (typeof entry.message.content !== "string") {
      throw failure(
        "GROK_PROTOCOL_ERROR",
        "Unsupported Grok Bot text reply schema.",
      );
    }
    const content = entry.message.content
      .replace(/\r\n/g, "\n")
      .replace(/\n+$/, "");
    const end = content.lastIndexOf("\n");
    const marker = content.slice(end + 1);
    let status;
    if (marker === `GROK_BRIDGE_DONE:${requestId}`) status = "completed";
    if (marker === `GROK_BRIDGE_BLOCKED:${requestId}`) status = "blocked";
    if (!status) continue;
    const result = end < 0 ? "" : content.slice(0, end).trim();
    if (!result)
      throw failure(
        "GROK_PROTOCOL_ERROR",
        "Grok Bot returned a terminal marker without a result.",
      );
    results.push({ status, result });
  }
  if (results.length > 1)
    throw failure(
      "GROK_CORRELATION_ERROR",
      "Grok Bot returned multiple terminal replies for this request.",
    );
  return results[0] ?? null;
}

export async function sendGrok({
  agent,
  task,
  requestId,
  timeoutMs = 600000,
  signal,
  bin = "gbot",
  cwd = process.cwd(),
  execute = runProcess,
}) {
  validate(agent, timeoutMs, signal);
  if (
    typeof requestId !== "string" ||
    !UUID.test(requestId) ||
    typeof task !== "string" ||
    !task.trim()
  ) {
    throw failure(
      "INVALID_INPUT",
      "Grok Bot requires a request UUID and a nonempty task.",
    );
  }
  const deadline = performance.now() + timeoutMs;
  const options = { deadline, signal, bin, cwd, execute };
  const target = await callGrok({ ...options, args: ["bots", "get", agent] });
  if (
    !object(target) ||
    typeof target.id !== "string" ||
    target.id.toLowerCase() !== agent.toLowerCase()
  ) {
    throw failure(
      "GROK_TARGET_MISMATCH",
      "Grok Bot returned a different or missing agent ID before submission.",
    );
  }
  if (target.kind !== "bot")
    throw failure(
      "GROK_GROUP_UNSUPPORTED",
      "Only individual Grok Bots are supported. No request was sent.",
    );
  const prompt = [
    `HANDOFF_CHILD: grok-bridge ${requestId}`,
    "Complete only the bounded task below, following its stated permissions and boundaries. Do not delegate recursively or invoke another Grok Bridge handoff. Do not treat this handoff as approval to broaden the task.",
    "Return your final result as a user-facing text message using your message tool. Only when the task is complete, place the following exact marker alone on its last line:",
    `GROK_BRIDGE_DONE:${requestId}`,
    "If blocked, explain the blocker and instead place this exact marker alone on the last line:",
    `GROK_BRIDGE_BLOCKED:${requestId}`,
    "Include a nonempty result or blocker before the marker. Progress updates must not include either terminal marker.",
    "",
    "TASK:",
    task,
  ].join("\n");
  const acknowledgement = await callGrok({
    ...options,
    args: ["send", agent, prompt],
    submitting: true,
  });
  if (
    !object(acknowledgement) ||
    typeof acknowledgement.id !== "string" ||
    acknowledgement.id.toLowerCase() !== agent.toLowerCase() ||
    acknowledgement.kind !== "bot" ||
    !object(acknowledgement.result) ||
    typeof acknowledgement.result.accepted !== "boolean"
  ) {
    throw failure(
      "DELIVERY_UNKNOWN",
      "Grok Bot returned an unsupported acknowledgement. Delivery is uncertain; inspect its conversation before retrying.",
    );
  }
  if (!acknowledgement.result.accepted)
    throw failure("GROK_REJECTED", "Grok Bot did not accept the request.");
  return { status: "submitted", provider: "grok", requestId, agent };
}

export async function readGrokThread({
  agent,
  timeoutMs = 30000,
  signal,
  bin = "gbot",
  cwd = process.cwd(),
  execute = runProcess,
}) {
  validate(agent, timeoutMs, signal);
  const transcript = await fetchTranscript({
    agent,
    deadline: performance.now() + timeoutMs,
    signal,
    bin,
    cwd,
    execute,
  });
  return { status: "transcript", provider: "grok", agent, transcript };
}

export async function waitGrok({
  agent,
  requestId,
  timeoutMs = 600000,
  pollMs = 2000,
  signal,
  bin = "gbot",
  cwd = process.cwd(),
  execute = runProcess,
}) {
  validate(agent, timeoutMs, signal);
  if (
    typeof requestId !== "string" ||
    !UUID.test(requestId) ||
    !Number.isFinite(pollMs) ||
    pollMs <= 0
  ) {
    throw failure(
      "INVALID_INPUT",
      "Waiting requires a request UUID and a positive polling interval.",
    );
  }
  const deadline = performance.now() + timeoutMs;
  const options = { agent, deadline, signal, bin, cwd, execute };
  for (;;) {
    remaining(deadline, signal);
    const transcript = await fetchTranscript(options);
    const result = correlatedResult(transcript, requestId);
    if (result) return { ...result, provider: "grok", requestId, agent };
    try {
      await sleep(Math.min(pollMs, remaining(deadline, signal)), undefined, {
        signal,
      });
    } catch (error) {
      if (error?.name === "AbortError")
        throw failure(
          "ABORTED",
          "Grok wait aborted. A submitted cloud task may continue.",
        );
      throw error;
    }
  }
}
