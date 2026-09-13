import { isAbsolute } from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

export function cursorArguments({
  cwd,
  mode = "review",
  session,
  model,
  input,
}) {
  if (typeof cwd !== "string" || !isAbsolute(cwd) || cwd.includes("\0")) {
    throw failure(
      "CURSOR_INVALID_INPUT",
      "Cursor requires an absolute workspace directory.",
    );
  }
  if (!["review", "work"].includes(mode)) {
    throw failure(
      "CURSOR_INVALID_INPUT",
      "Cursor mode must be review or work.",
    );
  }
  if (typeof input !== "string" || !input.trim() || input.includes("\0")) {
    throw failure(
      "CURSOR_INVALID_INPUT",
      "Cursor requires a nonempty text prompt without NUL bytes.",
    );
  }
  if (
    session !== undefined &&
    (typeof session !== "string" || !UUID.test(session))
  ) {
    throw failure(
      "CURSOR_INVALID_INPUT",
      "Cursor resume requires an explicit session UUID.",
    );
  }
  if (
    model !== undefined &&
    (typeof model !== "string" || !model.trim() || model.includes("\0"))
  ) {
    throw failure(
      "CURSOR_INVALID_INPUT",
      "Cursor model must be a nonempty string without NUL bytes.",
    );
  }
  const args = [
    "--print",
    "--output-format",
    "json",
    "--workspace",
    cwd,
    "--sandbox",
    "enabled",
  ];
  if (mode === "review") args.push("--mode", "ask");
  else args.push("--force");
  if (session !== undefined) args.push("--resume", session);
  if (model !== undefined) args.push("--model", model);
  args.push("--", input);
  return args;
}

export function parseCursor(stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw failure("CURSOR_PROTOCOL_ERROR", "Cursor returned invalid JSON.");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.type !== "result" ||
    typeof value.subtype !== "string" ||
    typeof value.is_error !== "boolean"
  ) {
    throw failure(
      "CURSOR_PROTOCOL_ERROR",
      "Cursor returned an unsupported terminal result.",
    );
  }
  if (value.subtype !== "success" || value.is_error) {
    throw failure(
      "CURSOR_PROVIDER_FAILED",
      "Cursor reported a failed turn. Check its authentication, permissions, and destination session.",
    );
  }
  if (
    typeof value.result !== "string" ||
    !value.result.trim() ||
    typeof value.session_id !== "string" ||
    !UUID.test(value.session_id)
  ) {
    throw failure(
      "CURSOR_PROTOCOL_ERROR",
      "Cursor exited without a session UUID and nonempty final result.",
    );
  }
  return {
    status: "completed",
    session: value.session_id,
    result: value.result,
  };
}
