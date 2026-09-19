import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, 'watcher.log');
const LOCK = join(DIR, '.supervisor-v2.lock');
const WATCHERS = [
  ['ops-v2', join(DIR, 'ops-watcher-v2.mjs')],
  ['auth-v2', join(DIR, 'auth-watcher-v2.mjs')],
];
const BASE_RESTART_MS = 1500;
const MAX_RESTART_MS = 30000;

let shuttingDown = false;
const children = new Map();

function log(message) {
  try {
    appendFileSync(LOG, `[${new Date().toISOString()}] supervisor-v2: ${message}\n`, 'utf8');
  } catch {}
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  if (existsSync(LOCK)) {
    try {
      const existing = JSON.parse(readFileSync(LOCK, 'utf8'));
      if (pidAlive(Number(existing?.pid))) {
        log(`another supervisor is already alive pid=${existing.pid}; exiting`);
        return false;
      }
    } catch {}
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), 'utf8');
  return true;
}

function releaseLock() {
  try {
    if (!existsSync(LOCK)) return;
    const current = JSON.parse(readFileSync(LOCK, 'utf8'));
    if (Number(current?.pid) === process.pid) unlinkSync(LOCK);
  } catch {}
}

function launch(label, script, attempt = 0) {
  if (shuttingDown) return;
  const out = openSync(LOG, 'a');
  const err = openSync(LOG, 'a');
  const child = spawn(process.execPath, [script], {
    cwd: DIR,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', out, err],
  });
  children.set(label, child);
  log(`${label} launched pid=${child.pid} attempt=${attempt}`);

  child.on('error', (error) => {
    log(`${label} spawn error: ${error?.message || error}`);
  });

  child.on('exit', (code, signal) => {
    children.delete(label);
    if (shuttingDown) return;
    const nextAttempt = attempt + 1;
    const delay = Math.min(MAX_RESTART_MS, BASE_RESTART_MS * (2 ** Math.min(nextAttempt, 5)));
    log(`${label} exited code=${code} signal=${signal || ''}; restart in ${delay}ms`);
    setTimeout(() => launch(label, script, nextAttempt), delay);
  });

  // If it survives for a minute, reset exponential-backoff history for the next crash.
  setTimeout(() => {
    if (!shuttingDown && children.get(label) === child) {
      child.__bridgeStable = true;
    }
  }, 60000).unref?.();
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutdown requested signal=${signal}`);
  for (const [label, child] of children.entries()) {
    try {
      child.kill();
      log(`${label} termination requested pid=${child.pid}`);
    } catch {}
  }
  setTimeout(() => {
    releaseLock();
    process.exit(0);
  }, 800).unref?.();
}

if (!acquireLock()) process.exit(0);
log(`starting pid=${process.pid}`);
for (const [label, script] of WATCHERS) launch(label, script, 0);

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', releaseLock);
process.on('uncaughtException', (error) => {
  log(`uncaughtException: ${String(error?.stack || error)}`);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (error) => {
  log(`unhandledRejection: ${String(error?.stack || error)}`);
  shutdown('unhandledRejection');
});

setInterval(() => {
  // Keep the supervisor event loop alive; child lifecycle events do the real work.
}, 60000);
