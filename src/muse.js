import { isAbsolute } from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && !value.includes("\0");
}

export function museArguments({
  cwd,
  mode = "review",
  session,
  model,
  promptFile,
}) {
  if (!isText(cwd) || !isAbsolute(cwd)) {
    throw failure(
      "MUSE_INVALID_INPUT",
      "Muse Code requires an absolute workspace directory.",
    );
  }
  if (!["review", "work"].includes(mode)) {
    throw failure("MUSE_INVALID_INPUT", "Muse Code mode must be review or work.");
  }
  if (!isText(promptFile) || !isAbsolute(promptFile)) {
    throw failure(
      "MUSE_INVALID_INPUT",
      "Muse Code requires an absolute prompt file path.",
    );
  }
  if (
    session !== undefined &&
    (typeof session !== "string" || !UUID.test(session))
  ) {
    throw failure(
      "MUSE_INVALID_INPUT",
      "Muse Code resume requires an explicit session UUID.",
    );
  }
  if (model !== undefined && (!isText(model) || !model.trim())) {
    throw failure(
      "MUSE_INVALID_INPUT",
      "Muse Code model must be a nonempty string without NUL bytes.",
    );
  }
  const args = [
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
  ];
  if (mode === "review") args.push("--disable-write", "--disable-shell");
  if (session !== undefined) args.push("--session-id", session);
  if (model !== undefined) args.push("--model", model);
  return args;
}

function envelope(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw failure("MUSE_PROTOCOL_ERROR", "Muse Code returned invalid JSONL.");
  }
  if (
    !isObject(value) ||
    !Number.isSafeInteger(value.schema_version) ||
    !isObject(value.stream) ||
    typeof value.stream.kind !== "string" ||
    !value.stream.kind ||
    typeof value.stream.id !== "string" ||
    !value.stream.id ||
    typeof value.payload_type !== "string" ||
    !value.payload_type ||
    !isObject(value.payload)
  ) {
    throw failure(
      "MUSE_PROTOCOL_ERROR",
      "Muse Code returned an invalid event envelope.",
    );
  }
  return value;
}

export function parseMuse(stdout) {
  if (typeof stdout !== "string") {
    throw failure("MUSE_PROTOCOL_ERROR", "Muse Code returned invalid JSONL.");
  }
  let session;
  let terminal;
  let approvalWait = false;
  const deltas = [];
  for (const line of stdout.split("\n").filter((line) => line.trim())) {
    const event = envelope(line);
    if (event.stream.kind === "session") {
      if (!UUID.test(event.stream.id)) {
        throw failure(
          "MUSE_PROTOCOL_ERROR",
          "Muse Code returned an invalid session identifier.",
        );
      }
      if (session === undefined) session = event.stream.id;
      else if (session !== event.stream.id) {
        throw failure(
          "MUSE_PROTOCOL_ERROR",
          "Muse Code returned events from an unrelated session.",
        );
      }
    }
    const { payload_type: type, payload } = event;
    if (type === "run.output.delta") {
      if (
        terminal !== undefined ||
        payload.kind !== "run_output_delta" ||
        typeof payload.text !== "string"
      ) {
        throw failure(
          "MUSE_PROTOCOL_ERROR",
          "Muse Code returned an invalid or out-of-order output event.",
        );
      }
      deltas.push(payload.text);
    } else if (type.startsWith("run.terminal.")) {
      if (
        terminal !== undefined ||
        payload.kind !== "run_terminal" ||
        typeof payload.terminal !== "string" ||
        !payload.terminal ||
        type !== `run.terminal.${payload.terminal}` ||
        (payload.text !== undefined &&
          payload.text !== null &&
          typeof payload.text !== "string") ||
        (payload.reason !== undefined &&
          payload.reason !== null &&
          typeof payload.reason !== "string")
      ) {
        throw failure(
          "MUSE_PROTOCOL_ERROR",
          "Muse Code returned an invalid or ambiguous terminal run event.",
        );
      }
      terminal = payload;
    } else if (type.startsWith("approval_wait.")) {
      approvalWait = true;
    }
  }
  if (terminal === undefined) {
    throw failure(
      "MUSE_PROTOCOL_ERROR",
      "Muse Code exited without a terminal run event.",
    );
  }
  if (session === undefined) {
    throw failure(
      "MUSE_PROTOCOL_ERROR",
      "Muse Code exited without a session identifier.",
    );
  }
  if (terminal.terminal !== "completed") {
    throw failure(
      "MUSE_PROVIDER_FAILED",
      "Muse Code did not complete the run. Check its authentication, permissions, and destination session.",
    );
  }
  const result =
    typeof terminal.text === "string" && terminal.text.trim()
      ? terminal.text
      : deltas.join("");
  if (!approvalWait && !result.trim()) {
    throw failure(
      "MUSE_PROTOCOL_ERROR",
      "Muse Code completed without a text result.",
    );
  }
  return {
    status: approvalWait ? "blocked" : "completed",
    session,
    result,
    ...(approvalWait
      ? {
          reason:
            "Muse Code waited for a tool approval that headless execution cannot answer. Review the destination session before continuing.",
        }
      : {}),
  };
}
