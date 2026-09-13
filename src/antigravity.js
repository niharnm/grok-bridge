import { isAbsolute } from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function antigravityArguments({
  cwd,
  mode = "review",
  session,
  model,
  timeoutMs = 600000,
}) {
  if (typeof cwd !== "string" || !isAbsolute(cwd) || cwd.includes("\0")) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity requires an absolute workspace directory.",
    );
  }
  if (!["review", "work"].includes(mode)) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity mode must be review or work.",
    );
  }
  if (
    session !== undefined &&
    (typeof session !== "string" || !UUID.test(session))
  ) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity resume requires an explicit conversation UUID.",
    );
  }
  if (
    model !== undefined &&
    (typeof model !== "string" || !model.trim() || model.includes("\0"))
  ) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity model must be a nonempty string without NUL bytes.",
    );
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2147483647
  ) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity timeout must be a positive supported number of milliseconds.",
    );
  }
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--sandbox",
    "--disable-slash-commands",
    "--mode",
    mode === "review" ? "plan" : "accept-edits",
    "--print-timeout",
    `${timeoutMs}ms`,
  ];
  if (session !== undefined) args.push("--conversation", session);
  if (model !== undefined) args.push("--model", model);
  return args;
}

export function antigravityInput(input) {
  if (typeof input !== "string" || !input.trim() || input.includes("\0")) {
    throw failure(
      "ANTIGRAVITY_INVALID_INPUT",
      "Antigravity requires a nonempty text prompt without NUL bytes.",
    );
  }
  return `${JSON.stringify({ event: "user", message: { content: input } })}\n`;
}

export function parseAntigravity(stdout) {
  if (typeof stdout !== "string") {
    throw failure(
      "ANTIGRAVITY_PROTOCOL_ERROR",
      "Antigravity returned invalid NDJSON.",
    );
  }
  let session;
  let terminal;
  let stepFailed = false;
  for (const line of stdout.split("\n").filter((line) => line.trim())) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw failure(
        "ANTIGRAVITY_PROTOCOL_ERROR",
        "Antigravity returned invalid NDJSON.",
      );
    }
    if (
      !isObject(event) ||
      typeof event.event !== "string" ||
      terminal !== undefined
    ) {
      throw failure(
        "ANTIGRAVITY_PROTOCOL_ERROR",
        "Antigravity returned an invalid or ambiguous event stream.",
      );
    }
    if (event.event === "init") {
      if (
        session !== undefined ||
        !isObject(event.init) ||
        typeof event.conversation_id !== "string" ||
        !UUID.test(event.conversation_id)
      ) {
        throw failure(
          "ANTIGRAVITY_PROTOCOL_ERROR",
          "Antigravity returned an invalid conversation initialization.",
        );
      }
      session = event.conversation_id;
    } else if (event.event === "step_update") {
      const step = event.step_update;
      if (
        session === undefined ||
        !isObject(step) ||
        step.conversation_id !== session ||
        !Number.isSafeInteger(step.step_index) ||
        step.step_index < 0 ||
        !["ACTIVE", "DONE", "ERROR"].includes(step.state) ||
        typeof step.step_type !== "string" ||
        !step.step_type
      ) {
        throw failure(
          "ANTIGRAVITY_PROTOCOL_ERROR",
          "Antigravity returned an invalid or unrelated step.",
        );
      }
      if (step.state === "ERROR") stepFailed = true;
      if (step.tool_info !== undefined) {
        if (!isObject(step.tool_info)) {
          throw failure(
            "ANTIGRAVITY_PROTOCOL_ERROR",
            "Antigravity returned invalid tool information.",
          );
        }
        if (step.tool_info.error !== undefined) {
          const error = step.tool_info.error;
          if (
            !isObject(error) ||
            typeof error.type !== "string" ||
            !error.type ||
            typeof error.message !== "string"
          ) {
            throw failure(
              "ANTIGRAVITY_PROTOCOL_ERROR",
              "Antigravity returned invalid tool error information.",
            );
          }
          stepFailed = true;
        }
      }
    } else if (event.event === "result") {
      if (!isObject(event.result) || typeof event.result.status !== "string") {
        throw failure(
          "ANTIGRAVITY_PROTOCOL_ERROR",
          "Antigravity returned an unsupported terminal result.",
        );
      }
      terminal = event.result;
    } else {
      throw failure(
        "ANTIGRAVITY_PROTOCOL_ERROR",
        "Antigravity returned an unsupported event type.",
      );
    }
  }
  if (terminal === undefined) {
    throw failure(
      "ANTIGRAVITY_PROTOCOL_ERROR",
      "Antigravity exited without a terminal result.",
    );
  }
  if (
    ![
      "SUCCESS",
      "ERROR",
      "CANCELED",
      "INTERRUPTED",
      "INVALID",
      "WAITING",
      "RUNNING",
    ].includes(terminal.status)
  ) {
    throw failure(
      "ANTIGRAVITY_PROTOCOL_ERROR",
      "Antigravity returned an unknown terminal status.",
    );
  }
  if (
    terminal.denied_actions !== undefined &&
    (!Array.isArray(terminal.denied_actions) ||
      terminal.denied_actions.some(
        (action) =>
          !isObject(action) ||
          typeof action.action !== "string" ||
          !action.action.trim() ||
          typeof action.display_name !== "string" ||
          !action.display_name.trim() ||
          Object.keys(action).some(
            (key) => !["action", "display_name"].includes(key),
          ),
      ))
  ) {
    throw failure(
      "ANTIGRAVITY_PROTOCOL_ERROR",
      "Antigravity returned invalid denied action information.",
    );
  }
  if (terminal.status !== "SUCCESS" || terminal.error !== undefined) {
    throw failure(
      "ANTIGRAVITY_PROVIDER_FAILED",
      "Antigravity did not complete the turn successfully. Check its authentication, permissions, and destination conversation.",
    );
  }
  const denied = Boolean(terminal.denied_actions?.length);
  const blocked = stepFailed || denied;
  if (
    session === undefined ||
    terminal.conversation_id !== session ||
    typeof terminal.response !== "string" ||
    (!blocked && !terminal.response.trim())
  ) {
    throw failure(
      "ANTIGRAVITY_PROTOCOL_ERROR",
      "Antigravity exited without a matching conversation UUID, a text result, or evidence supporting an empty result.",
    );
  }
  return {
    status: blocked ? "blocked" : "completed",
    session,
    result: terminal.response,
    ...(blocked
      ? {
          reason: denied
            ? "Antigravity denied one or more actions under its native permissions. Review the destination conversation before continuing."
            : "Antigravity reported one or more failed steps or tool errors. Verify the task in the destination conversation before continuing.",
        }
      : {}),
  };
}
