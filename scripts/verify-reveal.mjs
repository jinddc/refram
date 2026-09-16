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

function assert(condition, message) {
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
    process.platform === "linux" ? "/usr/bin/google-chrome-stable" : undefined,
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

async function waitFor(check, description, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
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
  const recentErrors = [];
  const processHandle = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
  );

  processHandle.stderr.setEncoding("utf8");
  processHandle.stderr.on("data", (chunk) => {
    recentErrors.push(chunk);
    if (recentErrors.length > 8) recentErrors.shift();
  });

  return { processHandle, recentErrors };
}

async function connectToPage(debugPort) {
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
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolveRequest, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolveRequest, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { socket, send };
}

async function evaluate(send, expression, awaitPromise = false) {
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

async function waitForPlayground(send) {
  await waitFor(
    () =>
      evaluate(
        send,
        `Boolean(customElements.get("motion-reveal")) && document.querySelectorAll(".reveal-card").length === 20`,
      ),
    "the standalone reveal playground",
  );
}

async function inspectAtRatio(send, ratio, waitMs) {
  return evaluate(
    send,
    `(async () => {
      const element = document.querySelector(".reveal-card");
      const documentTop = element.getBoundingClientRect().top + scrollY;
      const desiredTop = innerHeight - element.getBoundingClientRect().height * ${ratio};
      scrollTo(0, Math.max(0, documentTop - desiredTop));
      await new Promise((resolveWait) => setTimeout(resolveWait, ${waitMs}));
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return {
        ratio: Number((visibleHeight / rect.height).toFixed(4)),
        opacity: Number(style.opacity),
        visibility: style.visibility,
        transform: style.transform,
      };
    })()`,
    true,
  );
}

async function captureScreenshot(send, path) {
  const capture = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(capture.data, "base64"));
}

async function closeProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  processHandle.kill();
  await Promise.race([
    new Promise((resolveExit) => processHandle.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000)),
  ]);
}

async function main() {
  assert(existsSync(viteEntry), "Run npm install before visual verification.");
  assert(
    typeof WebSocket !== "undefined",
    "This harness requires Node.js 22 or newer.",
  );

  const chromePath = findChrome();
  const appPort = await reservePort();
  const debugPort = await reservePort();
  const baseUrl = `http://127.0.0.1:${appPort}/`;
  const userDataDirectory = await mkdtemp(join(tmpdir(), "motion-lab-reveal-"));
  await mkdir(artifactDirectory, { recursive: true });

  const desktopScreenshot = join(artifactDirectory, "reveal-desktop.png");
  const mobileScreenshot = join(artifactDirectory, "reveal-mobile-reduced.png");
  const vite = startVite(appPort);
  let chrome;
  let connection;

  try {
    await waitFor(async () => {
      const response = await fetch(baseUrl);
      return response.ok;
    }, "Vite");

    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${userDataDirectory}`,
        "--window-size=1440,1000",
        baseUrl,
      ],
      { stdio: "ignore" },
    );

    connection = await connectToPage(debugPort);
    const { send } = connection;
    await send("Page.enable");
    await send("Runtime.enable");
    await waitForPlayground(send);

    await evaluate(
      send,
      `(() => {
        const element = document.querySelector(".reveal-card");
        element.options = { ...element.options, threshold: 0.8, duration: 0.2 };
        scrollTo(0, 0);
      })()`,
    );

    const belowThreshold = await inspectAtRatio(send, 0.65, 200);
    assert(belowThreshold.ratio < 0.8, "The below-threshold fixture crossed 0.8.");
    assert(belowThreshold.opacity <= 0.01, "Reveal was visible before threshold.");
    assert(
      belowThreshold.visibility === "hidden",
      "Reveal was not hidden before threshold.",
    );

    const aboveThreshold = await inspectAtRatio(send, 0.95, 500);
    assert(aboveThreshold.ratio >= 0.8, "The trigger fixture did not cross 0.8.");
    assert(aboveThreshold.opacity >= 0.99, "Reveal did not settle after threshold.");
    assert(
      aboveThreshold.visibility === "visible",
      "Reveal did not become visible after threshold.",
    );
    await captureScreenshot(send, desktopScreenshot);

    await send("Emulation.setDeviceMetricsOverride", {
      width: 500,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await send("Page.reload", { ignoreCache: true });
    await waitForPlayground(send);

    const reducedMotion = await evaluate(
      send,
      `(async () => {
        const element = document.querySelector(".reveal-card");
        element.scrollIntoView({ block: "center" });
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        const style = getComputedStyle(element);
        return {
          opacity: Number(style.opacity),
          visibility: style.visibility,
          transform: style.transform,
        };
      })()`,
      true,
    );
    assert(
      reducedMotion.opacity >= 0.99,
      "Reduced motion did not apply final opacity.",
    );
    assert(
      reducedMotion.visibility === "visible",
      "Reduced motion did not apply final visibility.",
    );
    await captureScreenshot(send, mobileScreenshot);

    console.log(
      JSON.stringify({
        status: "pass",
        checks: {
          threshold: { below: belowThreshold.ratio, above: aboveThreshold.ratio },
          reducedMotion: "pass",
        },
        screenshots: [
          "artifacts/visual/reveal-desktop.png",
          "artifacts/visual/reveal-mobile-reduced.png",
        ],
      }),
    );
  } catch (error) {
    const viteError = vite.recentErrors.join("").trim();
    if (viteError) error.message += `\nVite: ${viteError.slice(-2_000)}`;
    throw error;
  } finally {
    if (connection?.send) {
      await connection.send("Browser.close").catch(() => undefined);
      connection.socket.close();
    }
    await closeProcess(chrome);
    await closeProcess(vite.processHandle);
    await rm(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "fail", error: error.message }));
  process.exitCode = 1;
});
