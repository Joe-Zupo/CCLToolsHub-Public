// Builds and runs the studio on this computer.
//
//   node scripts/studio.mjs prepare | start | stop | status | update
//
// What a person makes stays in .studio-data, which updates never touch.

import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 3006;
const ADDRESS = `http://${HOST}:${PORT}`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "web", "studio");
const data = join(root, ".studio-data");
const pidFile = join(root, "studio.pid");
const logFile = join(root, "studio.log");

const STEP_LIMIT_MS = 20 * 60_000;

const runEnv = () => ({ ...process.env, STUDIO_DATA: data });

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const portOpen = () =>
  new Promise((done) => {
    const socket = connect({ host: HOST, port: PORT });
    socket.setTimeout(1000);
    const finish = (open) => {
      socket.destroy();
      done(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });

async function waitForPort(open, seconds) {
  for (let left = seconds * 4; left > 0; left -= 1) {
    if ((await portOpen()) === open) return true;
    await sleep(250);
  }
  return false;
}

function savedPid() {
  try {
    const pid = Number(readFileSync(pidFile, "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/** Asks whatever holds the port, so a reused process id can never pass. */
async function isStudio() {
  const response = await fetch(`${ADDRESS}/api/studio/health`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return false;
  const body = await response.json().catch(() => null);
  return body?.app === "clipscript-studio";
}

function run(command) {
  const result = spawnSync(command, {
    cwd: root,
    env: runEnv(),
    stdio: "inherit",
    shell: true,
    timeout: STEP_LIMIT_MS,
  });
  if (result.error?.code === "ETIMEDOUT")
    fail(`\`${command}\` stalled for 20 minutes, so it was stopped.`);
  if (result.status !== 0) fail(`\`${command}\` did not finish.`);
}

/** The pnpm already here, or npx when a global install was never possible. */
function pnpmCommand() {
  const found = spawnSync("pnpm --version", {
    cwd: root,
    stdio: "ignore",
    shell: true,
    timeout: 60_000,
  });
  return found.status === 0 ? "pnpm" : "npx --yes pnpm@11.19.0";
}

function prepare() {
  const pnpm = pnpmCommand();
  run(`${pnpm} install --frozen-lockfile`);
  run(`${pnpm} --filter @repo/studio build`);
  console.log("Clipscript Studio is ready to start.");
}

async function start() {
  if (await isStudio()) {
    console.log(`Already running at ${ADDRESS}`);
    return;
  }
  if (await portOpen())
    fail(`Another program is using port ${PORT}. Close it, then start again.`);
  if (!existsSync(join(app, ".next", "BUILD_ID")))
    fail("The app has not been built. Run prepare first.");

  mkdirSync(data, { recursive: true });
  const log = openSync(logFile, "w");
  const next = join(app, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", HOST, "--port", String(PORT)],
    {
      cwd: app,
      env: runEnv(),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
    }
  );
  child.unref();
  closeSync(log);
  writeFileSync(pidFile, String(child.pid));

  const opened = await waitForPort(true, 60);
  const response = opened
    ? await fetch(ADDRESS, { signal: AbortSignal.timeout(60_000) }).catch(
        () => null
      )
    : null;
  if (!response?.ok) {
    try {
      process.kill(child.pid);
    } catch {
      // It has already exited.
    }
    rmSync(pidFile, { force: true });
    fail(`The studio did not start. Its log is at ${logFile}`);
  }
  console.log(`Running at ${ADDRESS}`);
}

/** Lets the app close its database, and kills it only if it does not exit. */
async function stop() {
  if (await isStudio()) {
    await fetch(`${ADDRESS}/api/studio/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!(await waitForPort(false, 20))) {
      const pid = savedPid();
      if (pid) process.kill(pid);
      await waitForPort(false, 15);
    }
  }
  rmSync(pidFile, { force: true });
  console.log("Stopped.");
}

async function chatgptStatus() {
  const response = await fetch(`${ADDRESS}/api/chatgpt/status`, {
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const { signedIn, planEnabled } = await response.json();
  return { signedIn, planEnabled };
}

async function status() {
  const running = await isStudio();
  console.log(
    JSON.stringify(
      {
        built: existsSync(join(app, ".next", "BUILD_ID")),
        running,
        portTaken: await portOpen(),
        address: ADDRESS,
        node: process.version,
        chatgpt: running ? await chatgptStatus() : null,
      },
      null,
      2
    )
  );
}

async function update() {
  const wasRunning = await isStudio();
  run("git pull --ff-only");
  if (wasRunning) await stop();
  prepare();
  if (wasRunning) await start();
}

if (Number(process.versions.node.split(".")[0]) < 24)
  fail(`This app needs Node.js 24 or newer. This is ${process.version}.`);

const commands = { prepare, start, stop, status, update };
const command = commands[process.argv[2]];
if (!command) fail("Use one of: prepare, start, stop, status, update.");
await command();
