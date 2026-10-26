import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "./process.js";
import { cursorArguments, parseCursor } from "./cursor.js";
import {
  antigravityArguments,
  antigravityInput,
  parseAntigravity,
} from "./antigravity.js";
import { museArguments, parseMuse } from "./muse.js";

export const localBinaries = Object.freeze({
  codex: "codex",
  claude: "claude",
  cursor: "agent",
  antigravity: "agy",
  muse: "muse",
});

// Muse Code's launcher self-updates and can start an interactive login.
// Pin the installed build and fail closed on missing credentials instead.
export const museEnvironment = Object.freeze({
  MUSE_NO_AUTO_UPDATE: "1",
  MUSE_LOGIN: "0",
});

export function localArguments({
  to,
  cwd,
  mode = "review",
  session,
  model,
  input,
  timeoutMs,
  promptFile,
}) {
  if (!Object.hasOwn(localBinaries, to))
    throw new Error(
      "Local target must be codex, claude, cursor, antigravity, or muse.",
    );
  if (!["review", "work"].includes(mode))
    throw new Error("Mode must be review or work.");
  if (to === "cursor")
    return cursorArguments({ cwd, mode, session, model, input });
  if (to === "antigravity")
    return antigravityArguments({ cwd, mode, session, model, timeoutMs });
  if (to === "muse")
    return museArguments({ cwd, mode, session, model, promptFile });
  if (to === "codex") {
    const args = [
      "exec",
      "-c",
      'approval_policy="never"',
      "--sandbox",
      mode === "review" ? "read-only" : "workspace-write",
      "--json",
      "--cd",
      cwd,
    ];
    if (model) args.push("--model", model);
    if (session) args.push("resume", session);
    args.push("-");
    return args;
  }
  const args = [
    "--print",
    "--output-format",
    "json",
    "--permission-mode",
    mode === "review" ? "dontAsk" : "acceptEdits",
    "--tools",
    mode === "review" ? "Read,Glob,Grep" : "Read,Glob,Grep,Edit,Write,Bash",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--disable-slash-commands",
    "--no-chrome",
  ];
  if (session) args.push("--resume", session);
  if (model) args.push("--model", model);
  return args;
}

export function parseCodex(stdout) {
  let session;
  let result;
  let completed = false;
  let failed = false;
  for (const line of stdout.split("\n").filter((line) => line.trim())) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error("Codex returned invalid JSONL.");
    }
    if (!event || typeof event !== "object" || typeof event.type !== "string")
      throw new Error("Codex returned an invalid event.");
    if (event.type === "thread.started") session = event.thread_id;
    if (event.type === "item.completed" && event.item?.type === "agent_message")
      result = event.item.text;
    if (event.type === "turn.completed") completed = true;
    if (event.type === "turn.failed" || event.type === "error") failed = true;
  }
  if (failed)
    throw new Error(
      "Codex reported a failed turn. Check the destination session.",
    );
  if (
    !completed ||
    typeof result !== "string" ||
    !result.trim() ||
    typeof session !== "string"
  ) {
    throw new Error(
      "Codex exited without a complete turn, session ID, and final result.",
    );
  }
  return { status: "completed", session, result };
}

export function parseClaude(stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Claude Code returned invalid JSON.");
  }
  if (!value || value.type !== "result")
    throw new Error("Claude Code returned an unsupported result shape.");
  if (value.is_error || value.subtype !== "success") {
    const error = new Error(
      "Claude Code reported a failed turn. Check its authentication, usage limits, and destination session.",
    );
    error.code =
      value.api_error_status === 403
        ? "PROVIDER_ACCESS_DENIED"
        : "PROVIDER_FAILED";
    throw error;
  }
  if (
    typeof value.result !== "string" ||
    !value.result.trim() ||
    typeof value.session_id !== "string"
  ) {
    throw new Error(
      "Claude Code exited without a session ID and final result.",
    );
  }
  if (
    value.permission_denials !== undefined &&
    !Array.isArray(value.permission_denials)
  )
    throw new Error("Claude Code returned invalid permission information.");
  return {
    status: value.permission_denials?.length ? "blocked" : "completed",
    session: value.session_id,
    result: value.result,
    ...(value.permission_denials?.length
      ? { reason: "The destination denied one or more required tool calls." }
      : {}),
  };
}

export async function runLocal({
  to,
  cwd,
  task,
  requestId,
  mode = "review",
  session,
  model,
  timeoutMs = 600000,
  signal,
  bin = localBinaries[to],
  execute = runProcess,
}) {
  const input = `HANDOFF_CHILD: grok-bridge ${requestId}\nYou are completing a bounded delegated task. Do not delegate back, invoke grok-bridge, or start a reciprocal handoff.\nWork only in ${cwd}. Mode: ${mode}. ${mode === "review" ? "Read and report; do not modify files." : "Edits within the task scope are authorized. Preserve unrelated changes."}\nDo not commit, publish, delete data, or contact people unless the task explicitly authorizes that action. Report actual checks and blockers.\n\nTASK\n${task}\n`;
  // Muse Code reads a headless prompt from a file or an argument, not stdin.
  // A private temporary file keeps the task out of process listings.
  let promptDir;
  let promptFile;
  if (to === "muse") {
    if (typeof task !== "string" || !task.trim() || task.includes("\0"))
      throw Object.assign(
        new Error("Muse Code requires a nonempty text task without NUL bytes."),
        { code: "MUSE_INVALID_INPUT" },
      );
    promptDir = await mkdtemp(join(tmpdir(), "grok-bridge-"));
    promptFile = join(promptDir, "task.txt");
    await writeFile(promptFile, input, { mode: 0o600, flag: "wx" });
  }
  try {
    const args = localArguments({
      to,
      cwd,
      mode,
      session,
      model,
      input,
      timeoutMs,
      promptFile,
    });
    const stdin =
      to === "cursor" || to === "muse"
        ? ""
        : to === "antigravity"
          ? antigravityInput(input)
          : input;
    const env = { ...process.env, GROK_BRIDGE_CHILD: "1" };
    if (to === "muse") Object.assign(env, museEnvironment);
    let output;
    try {
      output = await execute(bin, args, {
        cwd,
        input: stdin,
        timeoutMs,
        signal,
        env,
      });
    } catch (error) {
      if (to === "claude" && error.code === "PROCESS_EXIT" && error.stdout)
        parseClaude(error.stdout);
      if (to === "muse" && error.code === "PROCESS_EXIT" && error.stdout) {
        try {
          parseMuse(error.stdout);
        } catch (parsed) {
          if (parsed.code === "MUSE_PROVIDER_FAILED") throw parsed;
        }
      }
      throw error;
    }
    const parsers = {
      codex: parseCodex,
      claude: parseClaude,
      cursor: parseCursor,
      antigravity: parseAntigravity,
      muse: parseMuse,
    };
    const parsed = parsers[to](output.stdout);
    return { ...parsed, provider: to, requestId, cwd, mode };
  } finally {
    if (promptDir) await rm(promptDir, { recursive: true, force: true });
  }
}
