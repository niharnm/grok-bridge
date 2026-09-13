import { spawn, spawnSync } from "node:child_process";

const KILL_GRACE_MS = 250;

function processError(message, code) {
  return Object.assign(new Error(message), { code, stdout: "", stderr: "" });
}

function decodeOutput(chunks) {
  const buffer = Buffer.concat(chunks);
  const text = buffer.toString("utf8");
  const encoded = Buffer.from(text);
  if (encoded.length <= buffer.length) return text;
  let end = buffer.length;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  return encoded.subarray(0, end).toString("utf8");
}

export async function runProcess(
  command,
  args,
  {
    cwd,
    input = "",
    timeoutMs = 600_000,
    signal,
    env = process.env,
    maxOutputBytes = 8_388_608,
  } = {},
) {
  if (
    typeof command !== "string" ||
    !command ||
    !Array.isArray(args) ||
    args.some((arg) => typeof arg !== "string")
  ) {
    throw processError(
      "A command and string arguments are required.",
      "PROCESS_INVALID_ARGUMENT",
    );
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    (typeof input !== "string" && !Buffer.isBuffer(input))
  ) {
    throw processError(
      "Invalid process input, timeout, or output limit.",
      "PROCESS_INVALID_ARGUMENT",
    );
  }
  if (
    signal != null &&
    (typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function" ||
      typeof signal.aborted !== "boolean")
  ) {
    throw processError(
      "Invalid process cancellation signal.",
      "PROCESS_INVALID_ARGUMENT",
    );
  }
  if (signal?.aborted) {
    throw processError("Process was cancelled.", "PROCESS_ABORTED");
  }

  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let failure = null;
    let exitCode = null;
    let closed = false;
    let stopping = false;
    let deadline;
    let killTimer;
    let drainTimer;
    let capturedBytes = 0;
    const stdout = [];
    const stderr = [];

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      clearTimeout(drainTimer);
      signal?.removeEventListener("abort", onAbort);
      const output = {
        stdout: decodeOutput(stdout),
        stderr: decodeOutput(stderr),
        exitCode,
      };
      if (failure) {
        Object.assign(failure, output);
        reject(failure);
      } else {
        resolve(output);
      }
    }

    function signalTree(force) {
      if (!child?.pid) return;
      if (process.platform === "win32") {
        // taskkill cannot reliably find descendants after their parent has exited.
        const result = spawnSync(
          "taskkill",
          ["/PID", String(child.pid), "/T", ...(force ? ["/F"] : [])],
          { shell: false, windowsHide: true, stdio: "ignore", timeout: 1_000 },
        );
        if (result.error || result.status !== 0) {
          child.kill(force ? "SIGKILL" : "SIGTERM");
        }
        return;
      }
      try {
        process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") {
          failure ??= processError(
            "Process group cleanup failed.",
            "PROCESS_CLEANUP",
          );
        }
      }
    }

    function destroyPipes() {
      child?.stdin?.destroy();
      child?.stdout?.destroy();
      child?.stderr?.destroy();
    }

    function stop(error) {
      failure ??= error;
      if (settled || stopping) return;
      stopping = true;
      clearTimeout(deadline);
      clearTimeout(drainTimer);
      child?.stdin?.destroy();
      signalTree(false);
      killTimer = setTimeout(() => {
        signalTree(true);
        destroyPipes();
        child?.unref();
        finish();
      }, KILL_GRACE_MS);
    }

    function onAbort() {
      stop(processError("Process was cancelled.", "PROCESS_ABORTED"));
    }

    function collect(chunks, chunk) {
      if (settled) return;
      const remaining = maxOutputBytes - capturedBytes;
      if (remaining > 0) {
        const kept = chunk.subarray(0, remaining);
        chunks.push(kept);
        capturedBytes += kept.length;
      }
      if (chunk.length > remaining) {
        stop(
          processError(
            "Process exceeded its output limit.",
            "PROCESS_OUTPUT_LIMIT",
          ),
        );
      }
    }

    try {
      child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const code =
        typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : "PROCESS_SPAWN";
      failure = processError(`Could not start process (${code}).`, code);
      finish();
      return;
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) => {
      const code =
        typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : "PROCESS_SPAWN";
      failure ??= processError(`Could not start process (${code}).`, code);
      if (!child.pid) {
        destroyPipes();
        finish();
      } else {
        stop(failure);
      }
    });
    child.stdin.on("error", (error) => {
      // A program may close stdin intentionally before finishing successfully.
      if (error.code !== "EPIPE" && !settled && !stopping) {
        stop(processError("Could not write process input.", "PROCESS_STDIN"));
      }
    });
    child.stdout.on("error", () => {
      if (!settled && !stopping)
        stop(processError("Could not read process output.", "PROCESS_OUTPUT"));
    });
    child.stderr.on("error", () => {
      if (!settled && !stopping)
        stop(processError("Could not read process output.", "PROCESS_OUTPUT"));
    });
    child.on("exit", (code, exitSignal) => {
      exitCode = code;
      if (code !== 0) {
        failure ??= processError(
          exitSignal
            ? "Process exited after receiving a signal."
            : `Process exited with code ${code}.`,
          "PROCESS_EXIT",
        );
      }
      if (stopping || settled) return;
      if (process.platform !== "win32") {
        try {
          process.kill(-child.pid, 0);
          stop(failure);
          return;
        } catch (error) {
          if (error.code !== "ESRCH") {
            stop(
              processError(
                "Could not inspect process group.",
                "PROCESS_CLEANUP",
              ),
            );
            return;
          }
        }
      }
      // Inherited pipes must not keep a completed command pending indefinitely.
      drainTimer = setTimeout(() => {
        destroyPipes();
        finish();
      }, KILL_GRACE_MS);
      if (closed) finish();
    });
    child.on("close", () => {
      closed = true;
      if (!stopping) finish();
    });

    deadline = setTimeout(() => {
      stop(processError("Process exceeded its time limit.", "PROCESS_TIMEOUT"));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      child.stdin.end(input);
    } catch (error) {
      if (error.code !== "EPIPE") {
        stop(processError("Could not write process input.", "PROCESS_STDIN"));
      }
    }
  });
}
