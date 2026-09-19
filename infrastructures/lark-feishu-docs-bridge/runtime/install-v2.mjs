import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.LARK_BRIDGE_SOURCE_REPO || process.env.LARK_BRIDGE_REPO || 'your-account/your-private-runtime-repo';
const BRANCH = process.env.LARK_BRIDGE_SOURCE_BRANCH || process.env.LARK_BRIDGE_BRANCH || 'runtime';
const DEFAULT_TARGET = process.env.LARK_BRIDGE_LOCAL_DIR || 'C:\\lark-chat-bridge';
const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.LARK_BRIDGE_LOCAL_DIR || DEFAULT_TARGET;
const LOG = join(TARGET, 'install-v2.log');
const GH = process.env.GH_PATH || 'gh';

const FILES = [
  ['bridge/client/ops-watcher-v2.mjs', 'ops-watcher-v2.mjs'],
  ['bridge/client/auth-watcher-v2.mjs', 'auth-watcher-v2.mjs'],
  ['bridge/client/supervisor-v2.mjs', 'supervisor-v2.mjs'],
  ['bridge/client/startup.mjs', 'startup.mjs'],
];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    writeFileSync(LOG, `${existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''}${line}\n`, 'utf8');
  } catch {}
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60000,
    ...opts,
  });
  if (r.error) throw new Error(`Failed to run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `${cmd} exited with code ${r.status}`);
  }
  return r.stdout || '';
}

function fetchRepoText(path) {
  const raw = run(GH, ['api', '-X', 'GET', `repos/${REPO}/contents/${path}`, '-f', `ref=${BRANCH}`]);
  const obj = JSON.parse(raw);
  return Buffer.from(String(obj.content || '').replace(/\s/g, ''), 'base64').toString('utf8');
}

function findNativeLarkCli() {
  const envPath = String(process.env.LARK_CLI_PATH || '').trim();
  const candidates = [];
  if (envPath && /\.exe$/i.test(envPath)) candidates.push(envPath);
  if (envPath && /[\\/]/.test(envPath)) {
    candidates.push(join(dirname(envPath), 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe'));
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe'));
  }
  return candidates.find((p) => existsSync(p)) || null;
}

function syntaxCheck(path) {
  run(process.execPath, ['--check', path]);
}

function stopExistingSupervisor() {
  const lockPath = join(TARGET, '.supervisor-v2.lock');
  if (!existsSync(lockPath)) return;
  let pid = null;
  try {
    pid = Number(JSON.parse(readFileSync(lockPath, 'utf8'))?.pid);
  } catch {}
  if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
    log(`Stopping existing v2 supervisor pid=${pid}`);
    if (process.platform === 'win32') {
      const taskkill = process.env.SystemRoot
        ? join(process.env.SystemRoot, 'System32', 'taskkill.exe')
        : 'taskkill.exe';
      const r = spawnSync(taskkill, ['/PID', String(pid), '/T', '/F'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
      });
      if (r.error) throw new Error(`Failed to stop existing supervisor: ${r.error.message}`);
      if (r.status !== 0) {
        const msg = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
        log(`Existing supervisor stop returned ${r.status}: ${msg || 'process may already be gone'}`);
      }
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
  try { unlinkSync(lockPath); } catch {}
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  log(`Installing Lark Bridge v2 into ${TARGET}`);

  // Verify GitHub authentication before touching local bridge files.
  run(GH, ['auth', 'status']);

  const nativeCli = findNativeLarkCli();
  if (!nativeCli) {
    throw new Error('Native lark-cli.exe was not found in the existing npm installation. No files were activated.');
  }
  const version = run(nativeCli, ['--version']).trim();
  log(`Native Lark CLI detected: ${nativeCli} (${version || 'version unknown'})`);

  const staged = [];
  for (const [repoPath, localName] of FILES) {
    const text = fetchRepoText(repoPath);
    const stagePath = join(TARGET, `.v2-stage-${localName}`);
    writeFileSync(stagePath, text, 'utf8');
    syntaxCheck(stagePath);
    staged.push([stagePath, join(TARGET, localName)]);
    log(`Fetched and syntax-checked ${localName}`);
  }

  // Activation happens only after every file has downloaded and passed node --check.
  for (const [stagePath, finalPath] of staged) {
    writeFileSync(finalPath, readFileSync(stagePath));
  }

  // Ensure the freshly activated files are what the running supervisor loads.
  stopExistingSupervisor();

  // Launch the short-lived startup shim; it starts the detached supervisor and exits.
  const startup = spawn(process.execPath, [join(TARGET, 'startup.mjs')], {
    cwd: TARGET,
    env: process.env,
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  });
  startup.unref();

  log('LARK_BRIDGE_V2_INSTALL_COMPLETE');
  console.log('SUCCESS: Lark Bridge v2 installed and started.');
}

main().catch((error) => {
  log(`ERROR: ${String(error?.stack || error)}`);
  console.error('FAILED: Lark Bridge v2 was not fully installed. See install-v2.log.');
  process.exitCode = 1;
});
