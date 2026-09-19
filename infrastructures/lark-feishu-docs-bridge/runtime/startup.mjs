import { spawn } from 'node:child_process';
import { appendFileSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, 'watcher.log');
const SUPERVISOR = join(DIR, 'supervisor-v2.mjs');

function log(message) {
  try {
    appendFileSync(LOG, `[${new Date().toISOString()}] startup: ${message}\n`, 'utf8');
  } catch {}
}

try {
  const out = openSync(LOG, 'a');
  const err = openSync(LOG, 'a');
  const child = spawn(process.execPath, [SUPERVISOR], {
    cwd: DIR,
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
  });
  child.unref();
  log(`v2 supervisor launched detached pid=${child.pid}`);
} catch (error) {
  log(`v2 supervisor launch failed: ${error?.message || error}`);
  process.exitCode = 1;
}
