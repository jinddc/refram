import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts", "visual");
const viteEntry = join(root, "node_modules", "vite", "bin", "vite.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32"
      ? join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")
      : undefined,
    process.platform === "win32"
      ? join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe")
      : undefined,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  assert(chrome, "Chrome was not found. Set CHROME_PATH.");
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
      server.close((error) => error ? reject(error) : resolvePort(port));
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
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
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
    if (errors.length > 8) errors.shift();
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
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  return result.result.value;
}

async function screenshot(send, path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function closeProcess(handle) {
  if (!handle || handle.exitCode !== null) return;
  handle.kill();
  await Promise.race([
    new Promise((resolveExit) => handle.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000)),
  ]);
}

async function main() {
  assert(existsSync(viteEntry), "Run npm install before visual verification.");
  assert(typeof WebSocket !== "undefined", "This harness requires Node.js 22 or newer.");
  const chromePath = findChrome();
  const appPort = await reservePort();
  const debugPort = await reservePort();
  const url = `http://127.0.0.1:${appPort}/timeline.html`;
  const profile = await mkdtemp(join(tmpdir(), "motion-lab-timeline-"));
  await mkdir(artifacts, { recursive: true });
  const desktop = join(artifacts, "timeline-desktop.png");
  const mobile = join(artifacts, "timeline-mobile-reduced.png");
  const vite = startVite(appPort);
  let chrome;
  const chromeErrors = [];
  let connection;

  try {
    await waitFor(async () => (await fetch(url)).ok, "Vite");
    chrome = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--window-size=1440,1000",
      url,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    chrome.stderr.setEncoding("utf8");
    chrome.stderr.on("data", (chunk) => {
      chromeErrors.push(chunk);
      if (chromeErrors.length > 12) chromeErrors.shift();
    });
    connection = await connect(debugPort);
    const { send } = connection;
    await send("Page.enable");
    await send("Runtime.enable");
    await waitFor(
      () => evaluate(send, `Boolean(window.__timelineHarness) && customElements.get("motion-tween") && document.querySelectorAll("#stress motion-tween").length === 20`),
      "the timeline playground",
    );

    const idle = await evaluate(send, `(() => {
      const first = document.querySelector("#sequence-a");
      const nested = document.querySelector("#nested-tween");
      return {
        firstOpacity: Number(getComputedStyle(first).opacity),
        firstTransform: getComputedStyle(first).transform,
        nestedTransform: getComputedStyle(nested).transform,
        outerDuration: window.__timelineHarness.sequence.totalDuration(),
        stressCount: document.querySelectorAll("#stress motion-tween").length,
      };
    })()`);
    assert(idle.firstOpacity === 1, "Idle timeline changed target opacity.");
    assert(idle.firstTransform === "none", "Idle timeline changed target transform.");
    assert(idle.nestedTransform === "none", "Outer timeline changed nested ownership.");
    assert(idle.outerDuration > 0 && idle.outerDuration < 1.65, "Overlap timing was not compiled.");
    assert(idle.stressCount === 20, "The 20-tween stress fixture is incomplete.");

    const scrollInitial = await evaluate(send, `(() => {
      const { ScrollTrigger, scrollNestedTween } = window.__timelineHarness;
      const trigger = ScrollTrigger.getAll()[0];
      return {
        count: ScrollTrigger.getAll().length,
        progress: trigger?.progress ?? -1,
        opacity: Number(getComputedStyle(document.querySelector("#scroll-a")).opacity),
        nestedTransform: getComputedStyle(scrollNestedTween).transform,
      };
    })()`);
    assert(scrollInitial.count === 1, "Scroll mode did not create exactly one root trigger.");
    assert(scrollInitial.opacity < 0.2, "Scroll mode did not prepare initial presentation.");
    assert(scrollInitial.nestedTransform === "none", "Scroll mode captured a nested manual tween.");

    const scrollBehavior = await evaluate(send, `(async () => {
      const harness = window.__timelineHarness;
      let trigger = harness.ScrollTrigger.getAll()[0];
      const scrollToProgress = async (progress) => {
        window.scrollTo(0, trigger.start + ((trigger.end - trigger.start) * progress));
        harness.ScrollTrigger.update();
        await new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait)));
      };

      await scrollToProgress(0.68);
      const forward = trigger.progress;
      const forwardOpacity = Number(getComputedStyle(document.querySelector("#scroll-a")).opacity);
      await scrollToProgress(0.24);
      const reverse = trigger.progress;
      const beforeMutation = trigger.progress;
      harness.mutateScrollTimeline();
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait)));
      trigger = harness.ScrollTrigger.getAll()[0];
      const afterMutation = trigger.progress;
      const countAfterMutation = harness.ScrollTrigger.getAll().length;
      window.scrollTo(0, trigger.end + 160);
      harness.ScrollTrigger.update();
      await new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait)));

      return {
        forward,
        reverse,
        forwardOpacity,
        beforeMutation,
        afterMutation,
        countAfterMutation,
        endProgress: trigger.progress,
        activeAfterEnd: trigger.isActive,
        nestedTransform: getComputedStyle(harness.scrollNestedTween).transform,
      };
    })()`, true);
    assert(scrollBehavior.forward > 0.6, "Forward scroll did not scrub timeline progress.");
    assert(scrollBehavior.reverse < scrollBehavior.forward, "Reverse scroll did not reverse timeline progress.");
    assert(scrollBehavior.forwardOpacity > scrollInitial.opacity, "Scroll scrub did not render destination presentation.");
    assert(Math.abs(scrollBehavior.afterMutation - scrollBehavior.beforeMutation) < 0.04, "Scroll mutation did not preserve progress.");
    assert(scrollBehavior.countAfterMutation === 1, "Scroll mutation left duplicate root triggers.");
    assert(scrollBehavior.endProgress === 1 && !scrollBehavior.activeAfterEnd, "Pin/trigger did not release after its end boundary.");
    assert(scrollBehavior.nestedTransform === "none", "Scroll rebuild captured nested ownership.");

    const forward = await evaluate(send, `(async () => {
      const { sequence } = window.__timelineHarness;
      const first = document.querySelector("#sequence-a");
      const nested = document.querySelector("#nested-tween");
      const run = sequence.play();
      const prepared = Number(getComputedStyle(first).opacity);
      sequence.finish();
      await run;
      return {
        prepared,
        finalOpacity: Number(getComputedStyle(first).opacity),
        nestedTransform: getComputedStyle(nested).transform,
        state: sequence.playState,
      };
    })()`, true);
    assert(forward.prepared < 0.3, "Forward play did not synchronously prepare from state.");
    assert(forward.finalOpacity === 1 && forward.state === "finished", "Forward timeline did not finish.");
    assert(forward.nestedTransform === "none", "Nested tween was controlled by the outer timeline.");

    const asyncAppend = await evaluate(send, `(async () => {
      const { empty, appendAsyncTween } = window.__timelineHarness;
      const run = empty.play();
      const firstLate = appendAsyncTween();
      await new Promise((resolveWait) => setTimeout(resolveWait, 80));
      const started = empty.playState === "running";
      empty.finish();
      await run;

      const endpointRun = empty.play();
      await endpointRun;
      await new Promise((resolveWait) => setTimeout(resolveWait, 120));
      const retainedOpacity = Number(getComputedStyle(firstLate).opacity);
      const secondLate = appendAsyncTween();
      await new Promise((resolveWait) => setTimeout(resolveWait, 80));
      const appendedAgain = empty.playState === "running";
      empty.finish();
      await empty.finished;

      return {
        started,
        appendedAgain,
        retainedOpacity,
        state: empty.playState,
        opacity: Number(getComputedStyle(secondLate).opacity),
      };
    })()`, true);
    assert(asyncAppend.started, "Empty play intent did not start appended content.");
    assert(asyncAppend.retainedOpacity === 1, "Endpoint play caused a completed tween to flick.");
    assert(asyncAppend.appendedAgain, "A second async append did not start.");
    assert(asyncAppend.state === "finished" && asyncAppend.opacity === 1, "Async append did not finish.");
    await screenshot(send, desktop);

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
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    await waitFor(() => evaluate(send, `Boolean(window.__timelineHarness)`), "the reduced-motion playground");
    const reduced = await evaluate(send, `(async () => {
      const { sequence, scrollSequence, ScrollTrigger } = window.__timelineHarness;
      await sequence.play();
      const first = document.querySelector("#sequence-a");
      const scrollFirst = document.querySelector("#scroll-a");
      return {
        state: sequence.playState,
        opacity: Number(getComputedStyle(first).opacity),
        duration: sequence.totalDuration(),
        scrollState: scrollSequence.playState,
        scrollOpacity: Number(getComputedStyle(scrollFirst).opacity),
        triggerCount: ScrollTrigger.getAll().length,
      };
    })()`, true);
    assert(reduced.state === "finished", "Reduced motion did not settle timeline state.");
    assert(reduced.opacity === 1, "Reduced motion did not apply final presentation.");
    assert(reduced.duration === 0, "Reduced motion allocated an interpolated timeline.");
    assert(reduced.scrollState === "finished", "Reduced scroll mode did not expose finished state.");
    assert(reduced.scrollOpacity === 1, "Reduced scroll mode did not apply final presentation.");
    assert(reduced.triggerCount === 0, "Reduced scroll mode allocated a ScrollTrigger resource.");
    await screenshot(send, mobile);

    console.log(JSON.stringify({
      status: "pass",
      checks: {
        idle: "readable",
        overlapDuration: idle.outerDuration,
        nestedOwnership: "pass",
        scrollDriver: "pass",
        scrollMutation: "progress-preserved",
        asyncAppend: "pass",
        reducedMotion: "pass",
        stressTweens: idle.stressCount,
      },
      screenshots: [
        "artifacts/visual/timeline-desktop.png",
        "artifacts/visual/timeline-mobile-reduced.png",
      ],
    }));
  } catch (error) {
    const viteError = vite.errors.join("").trim();
    if (viteError) error.message += `\nVite: ${viteError.slice(-2_000)}`;
    const chromeError = chromeErrors.join("").trim();
    if (chromeError) error.message += `\nChrome: ${chromeError.slice(-4_000)}`;
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

main().catch((error) => {
  console.error(JSON.stringify({ status: "fail", error: error.message }));
  process.exitCode = 1;
});
