import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = join(root, "artifacts", "visual");
const viteEntry = join(root, "node_modules", "vite", "bin", "vite.js");
const cdpTimeoutMs = 8_000;

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32"
      ? join(
          process.env.PROGRAMFILES ?? "C:\\Program Files",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.platform === "win32"
      ? join(
          process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux"
      ? "/usr/bin/google-chrome-stable"
      : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
  ].filter(Boolean);

  const chrome = candidates.find((candidate) => existsSync(candidate));
  assert(
    chrome,
    "Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.",
  );
  return chrome;
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

export async function waitFor(
  check,
  description,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  throw new Error(
    `Timed out waiting for ${description}${
      lastError ? `: ${lastError.message}` : ""
    }`,
  );
}

function startVite(port) {
  const errors = [];
  const handle = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
  );

  handle.stderr.setEncoding("utf8");
  handle.stderr.on("data", (chunk) => {
    errors.push(chunk);
    if (errors.length > 8) {
      errors.shift();
    }
  });

  return { handle, errors };
}

async function connect(debugPort) {
  const page = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    return targets.find((target) => target.type === "page");
  }, "the Chrome page target");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) {
      return;
    }

    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });

  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Chrome DevTools connection closed."));
    }
    pending.clear();
  });

  const send = (method, params = {}) =>
    new Promise((resolveRequest, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, cdpTimeoutMs);

      pending.set(id, { resolve: resolveRequest, reject, timer });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });

  return { socket, send };
}

export async function evaluate(send, expression, awaitPromise = false) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  }
  return result.result.value;
}

export async function screenshot(send, path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function closeProcess(handle) {
  if (!handle || handle.exitCode !== null) {
    return;
  }

  handle.kill();
  await Promise.race([
    new Promise((resolveExit) => handle.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000)),
  ]);
}

export async function runVisualHarness(
  { pagePath, profilePrefix },
  verify,
) {
  assert(existsSync(viteEntry), "Run npm install before visual verification.");
  assert(
    typeof WebSocket !== "undefined",
    "This harness requires Node.js 22 or newer.",
  );

  const chromePath = findChrome();
  const appPort = await reservePort();
  const debugPort = await reservePort();
  const url = new URL(pagePath, `http://127.0.0.1:${appPort}/`).href;
  const profile = await mkdtemp(join(tmpdir(), profilePrefix));
  await mkdir(artifactDirectory, { recursive: true });

  const vite = startVite(appPort);
  const chromeErrors = [];
  let chrome;
  let connection;

  try {
    await waitFor(async () => (await fetch(url)).ok, "Vite");

    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--window-size=1440,1000",
        url,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    chrome.stderr.setEncoding("utf8");
    chrome.stderr.on("data", (chunk) => {
      chromeErrors.push(chunk);
      if (chromeErrors.length > 12) {
        chromeErrors.shift();
      }
    });

    connection = await connect(debugPort);
    const { send } = connection;
    await send("Page.enable");
    await send("Runtime.enable");
    await verify({ artifactDirectory, send });
  } catch (error) {
    const viteError = vite.errors.join("").trim();
    if (viteError) {
      error.message += `\nVite: ${viteError.slice(-2_000)}`;
    }

    const chromeError = chromeErrors.join("").trim();
    if (chromeError) {
      error.message += `\nChrome: ${chromeError.slice(-4_000)}`;
    }
    throw error;
  } finally {
    if (connection?.send) {
      await connection.send("Browser.close").catch(() => undefined);
      connection.socket.close();
    }
    await closeProcess(chrome);
    await closeProcess(vite.handle);
    await rm(profile, { recursive: true, force: true });
  }
}

export function reportVisualFailure(error) {
  const message = String(error.message ?? error).slice(0, 2_000);
  const infrastructureFailure =
    /Target crashed|target closed|DevTools connection|DevTools command timed out|GPU process|Chrome.*exited/i.test(
      message,
    );
  const sandboxAccessFailure =
    /exit_code=-1073741790|0xC0000022|GPUPersistentCache[\s\S]*being used by another process/i.test(
      message,
    );

  console.error(
    JSON.stringify({
      status: "fail",
      kind: infrastructureFailure ? "browser-infrastructure" : "assertion",
      ...(sandboxAccessFailure
        ? {
            hint: "Chrome hit Windows access/cache errors associated with the sandbox. Run this visual verification outside the sandbox; this is not an effect assertion failure.",
          }
        : {}),
      error: message,
    }),
  );
  process.exitCode = 1;
}
