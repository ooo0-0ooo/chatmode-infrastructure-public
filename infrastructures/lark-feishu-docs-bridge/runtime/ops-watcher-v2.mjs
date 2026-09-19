import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.LARK_BRIDGE_REPO || 'your-account/your-private-runtime-repo';
const BRANCH = process.env.LARK_BRIDGE_BRANCH || 'runtime';
const ASSET_BRANCH = process.env.LARK_BRIDGE_ASSET_BRANCH || 'assets';
const REQUEST_PATH = process.env.LARK_BRIDGE_V2_OPS_REQUEST_PATH || 'bridge/v2/ops-request.json';
const RESPONSE_PATH = process.env.LARK_BRIDGE_V2_OPS_RESPONSE_PATH || 'bridge/v2/ops-response.json';
const POLL_MS = Math.max(3000, Number(process.env.LARK_BRIDGE_POLL_MS || 5000));
const LARK_CLI_ENV = process.env.LARK_CLI_PATH || 'lark-cli';
const GH = process.env.GH_PATH || 'gh';
const MAX_OUTPUT = Math.max(20000, Number(process.env.LARK_BRIDGE_OPS_MAX_OUTPUT || 900_000));
const ASSET_CHUNK_CHARS = Math.min(64000, Math.max(12000, Number(process.env.LARK_BRIDGE_ASSET_CHUNK_CHARS || 48000)));
const MAX_ASSET_FILES = 60;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const PENDING_PATH = join(DIR, '.ops-v2-pending.json');

const ALLOWED_ROOTS = new Set([
  'api', 'schema',
  'docs', 'mindnotes', 'drive', 'wiki', 'whiteboard', 'board',
  'base', 'sheets', 'slides', 'minutes', 'markdown', 'space', 'search',
]);
const BLOCKED_ROOTS = new Set([
  'auth', 'config', 'update', 'completion', 'doctor', 'server', 'mcp', 'skills', 'install',
]);
const WRITE_WORDS = new Set([
  'create', 'update', 'delete', 'write', 'set', 'add', 'patch', 'upload', 'import',
  'move', 'copy', 'replace', 'insert', 'submit', 'send', 'reply', 'overwrite', 'append',
  'remove', 'arrange', 'grant', 'apply', 'publish', 'cancel', 'restore', 'archive',
  'trash', 'transfer', 'bind', 'clear', 'rename', 'share', 'revoke', 'put', 'upsert',
]);

let lastRequestId = null;
let busy = false;
let pending = loadPending();

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ops-v2: ${msg}\n`);
}

function safePart(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'item';
}

function resolveNativeLarkCli() {
  const raw = String(LARK_CLI_ENV || '').trim() || 'lark-cli';
  if (process.platform !== 'win32') return raw;

  if (/\.exe$/i.test(raw) && existsSync(raw)) return raw;

  const candidates = [];
  if (/[\\/]/.test(raw) || /\.(cmd|bat|ps1)$/i.test(raw)) {
    const shimDir = dirname(raw);
    candidates.push(join(shimDir, 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe'));
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe'));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (/\.(cmd|bat|ps1)$/i.test(raw)) {
    throw new Error(`Native lark-cli.exe not found beside npm shim ${raw}; refusing PowerShell/cmd shim fallback`);
  }
  return raw;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 45_000,
    ...opts,
  });
  if (r.error) {
    const code = r.error.code ? ` (${r.error.code})` : '';
    throw new Error(`Failed to run ${cmd}${code}: ${r.error.message}`);
  }
  if (r.status !== 0) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `${cmd} exited with code ${r.status}`);
  }
  return (r.stdout || '').trim();
}

function ghApi(args, inputObj = null) {
  return run(
    GH,
    ['api', ...args, ...(inputObj ? ['--input', '-'] : [])],
    inputObj ? { input: JSON.stringify(inputObj), timeout: 45_000 } : { timeout: 45_000 },
  );
}

function getRepoFile(path, branch = BRANCH) {
  const raw = ghApi(['-X', 'GET', `repos/${REPO}/contents/${path}`, '-f', `ref=${branch}`]);
  const obj = JSON.parse(raw);
  const content = Buffer.from(String(obj.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { sha: obj.sha, content };
}

function putRepoFile(path, text, message, branch = BRANCH) {
  let sha = null;
  try { sha = getRepoFile(path, branch).sha; } catch {}
  const body = { message, content: Buffer.from(text, 'utf8').toString('base64'), branch };
  if (sha) body.sha = sha;
  ghApi(['-X', 'PUT', `repos/${REPO}/contents/${path}`], body);
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function loadPending() {
  try {
    if (!existsSync(PENDING_PATH)) return null;
    const obj = JSON.parse(readFileSync(PENDING_PATH, 'utf8'));
    if (!obj?.id || !obj?.response) return null;
    return obj;
  } catch {
    return null;
  }
}

function savePending(value) {
  pending = value;
  writeFileSync(PENDING_PATH, JSON.stringify(value), 'utf8');
}

function clearPending() {
  pending = null;
  try { unlinkSync(PENDING_PATH); } catch {}
}

function initializeCursor() {
  try {
    const response = JSON.parse(getRepoFile(RESPONSE_PATH).content);
    lastRequestId = String(response?.request_id || '').trim() || null;
  } catch {}
}

function publishPending() {
  if (!pending) return;
  putRepoFile(
    RESPONSE_PATH,
    JSON.stringify(pending.response, null, 2),
    `lark-bridge-v2-ops: respond ${pending.id}`,
  );
  lastRequestId = pending.id;
  log(`request ${pending.id} -> ${pending.response.status}`);
  clearPending();
}

function normalizeArgs(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('lark.cli requires a non-empty args array');
  if (value.length > 160) throw new Error('Too many lark-cli arguments');
  const args = value.map((v) => String(v));
  for (const arg of args) {
    if (arg.length > 700_000) throw new Error('A lark-cli argument is too large; use stdin_text or an input asset');
    if (/[\r\n\0]/.test(arg)) throw new Error('Blocked newline/NUL in lark-cli argument');
    if (/^[A-Za-z]:[\\/]/.test(arg) || /^\\\\/.test(arg) || /^\.{1,2}[\\/]/.test(arg)) {
      throw new Error('Direct local filesystem paths are blocked; use {{input:name}} or {{output:name}} placeholders');
    }
    if (arg.startsWith('@') && !arg.startsWith('@http')) {
      throw new Error('Direct @file arguments are blocked; use an input asset placeholder');
    }
  }
  const root = args[0].toLowerCase();
  if (BLOCKED_ROOTS.has(root)) throw new Error(`Blocked lark-cli administrative root: ${root}`);
  if (!ALLOWED_ROOTS.has(root)) throw new Error(`Unsupported lark-cli root for this bridge: ${root}`);
  return args;
}

function looksLikeWrite(args) {
  if (args.includes('--dry-run')) return false;
  const root = String(args[0] || '').toLowerCase();

  if (root === 'api') {
    const positionalMethod = String(args[1] || '').toUpperCase();
    if (positionalMethod && positionalMethod !== 'GET' && positionalMethod !== 'HEAD') return true;
    for (let i = 0; i < args.length - 1; i += 1) {
      if (args[i] === '-X' || args[i] === '--method') {
        const method = String(args[i + 1] || '').toUpperCase();
        if (method && method !== 'GET' && method !== 'HEAD') return true;
      }
    }
  }

  for (const raw of args.slice(1)) {
    const token = String(raw).toLowerCase().replace(/^-+/, '').replace(/^\+/, '');
    const parts = token.split(/[-_:./=]+/).filter(Boolean);
    if (parts.some((part) => WRITE_WORDS.has(part))) return true;
  }
  return false;
}

function ensureIntent(req, args) {
  const intent = String(req?.intent || '').trim().toLowerCase();
  if (!['read', 'write'].includes(intent)) throw new Error('lark.cli requires intent="read" or intent="write"');
  const write = looksLikeWrite(args);
  if (write && intent !== 'write') throw new Error('Command appears mutating but request intent is not write');
  if (intent === 'write' && req?.write_authorized !== true) {
    throw new Error('Write request requires write_authorized=true; only set it when the current user message explicitly requested that mutation');
  }
  return { intent, write };
}

function walkFiles(root) {
  const out = [];
  function rec(path) {
    const st = statSync(path);
    if (st.isFile()) {
      out.push(path);
      return;
    }
    if (!st.isDirectory()) return;
    for (const name of readdirSync(path)) rec(join(path, name));
  }
  rec(root);
  return out;
}

function materializeInputs(req, dir) {
  const inputMap = new Map();
  const inputs = req?.inputs && typeof req.inputs === 'object' ? req.inputs : {};
  for (const [nameRaw, spec] of Object.entries(inputs)) {
    const name = safePart(nameRaw);
    if (!spec || typeof spec !== 'object') throw new Error(`Invalid input asset spec: ${nameRaw}`);
    const repoPath = String(spec.repo_path || '').trim();
    if (!repoPath.startsWith('bridge/')) throw new Error(`Input asset must live under bridge/: ${nameRaw}`);
    const branch = String(spec.branch || ASSET_BRANCH);
    const encoding = String(spec.encoding || 'base64').toLowerCase();
    const fetched = getRepoFile(repoPath, branch);
    let bytes;
    if (encoding === 'base64') bytes = Buffer.from(fetched.content.replace(/\s/g, ''), 'base64');
    else if (encoding === 'utf8' || encoding === 'utf-8') bytes = Buffer.from(fetched.content, 'utf8');
    else throw new Error(`Unsupported input asset encoding: ${encoding}`);
    if (bytes.length > MAX_ASSET_BYTES) throw new Error(`Input asset too large: ${nameRaw}`);
    const path = join(dir, `input-${name}`);
    writeFileSync(path, bytes);
    inputMap.set(nameRaw, path);
    inputMap.set(name, path);
  }
  return inputMap;
}

function prepareOutputs(req, dir) {
  const outputMap = new Map();
  const outputs = req?.outputs && typeof req.outputs === 'object' ? req.outputs : {};
  for (const [nameRaw, spec] of Object.entries(outputs)) {
    const name = safePart(nameRaw);
    const filename = safePart(spec?.filename || nameRaw);
    const path = join(dir, `output-${name}-${filename}`);
    outputMap.set(nameRaw, path);
    outputMap.set(name, path);
  }
  return outputMap;
}

function substitutePlaceholders(args, inputMap, outputMap) {
  return args.map((arg) => String(arg).replace(/\{\{(input|output):([^}]+)\}\}/g, (_m, kind, key) => {
    const map = kind === 'input' ? inputMap : outputMap;
    const path = map.get(key);
    if (!path) throw new Error(`Unknown ${kind} placeholder: ${key}`);
    return `./${basename(path)}`;
  }));
}

function publishAssetFile(requestId, key, filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.length > MAX_ASSET_BYTES) throw new Error(`Output asset exceeds ${MAX_ASSET_BYTES} bytes: ${basename(filePath)}`);
  const b64 = bytes.toString('base64');
  const folder = `bridge/v2/ops-assets/${safePart(requestId)}/${safePart(key)}`;
  const chunks = [];
  for (let off = 0, part = 1; off < b64.length; off += ASSET_CHUNK_CHARS, part += 1) {
    const chunk = b64.slice(off, off + ASSET_CHUNK_CHARS);
    const path = `${folder}/part-${String(part).padStart(3, '0')}.b64`;
    putRepoFile(path, chunk, `lark-bridge-v2-assets: ${safePart(requestId)} ${safePart(key)} ${part}`, ASSET_BRANCH);
    chunks.push(path);
  }
  return {
    key,
    filename: basename(filePath),
    size_bytes: bytes.length,
    branch: ASSET_BRANCH,
    chunks,
  };
}

function collectAndPublishOutputs(requestId, outputMap) {
  const unique = new Map();
  for (const [key, path] of outputMap.entries()) {
    if (unique.has(path)) continue;
    unique.set(path, key);
  }
  const assets = [];
  for (const [path, key] of unique.entries()) {
    let candidates = [];
    if (existsSync(path)) {
      candidates = walkFiles(path);
    } else {
      const parent = dirname(path);
      const prefix = basename(path);
      if (existsSync(parent)) {
        candidates = readdirSync(parent)
          .filter((name) => name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))
          .map((name) => join(parent, name))
          .filter((p) => statSync(p).isFile());
      }
    }
    if (candidates.length > MAX_ASSET_FILES) throw new Error(`Too many output files for ${key}`);
    for (let i = 0; i < candidates.length; i += 1) {
      const itemKey = candidates.length === 1 ? key : `${key}-${i + 1}`;
      assets.push(publishAssetFile(requestId, itemKey, candidates[i]));
    }
  }
  return assets;
}

function handleLarkCli(req) {
  const requestId = String(req?.request_id || '').trim();
  let args = normalizeArgs(req?.args);
  const { intent, write } = ensureIntent(req, args);

  const temp = mkdtempSync(join(tmpdir(), 'lark-bridge-v2-'));
  try {
    const inputMap = materializeInputs(req, temp);
    const outputMap = prepareOutputs(req, temp);
    args = substitutePlaceholders(args, inputMap, outputMap);

    if (!args.includes('--as') && args[0] !== 'schema') args.push('--as', 'user');

    const timeoutMs = Math.min(300_000, Math.max(5_000, Number(req?.timeout_ms || 120_000)));
    const stdin = req?.stdin_text == null ? undefined : String(req.stdin_text);
    if (stdin && Buffer.byteLength(stdin, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('stdin_text exceeds 2 MiB; use input assets');
    }

    const cliPath = resolveNativeLarkCli();
    const stdout = run(cliPath, args, { timeout: timeoutMs, input: stdin, cwd: temp });
    const assets = collectAndPublishOutputs(requestId, outputMap);
    const parsed = parseJsonLoose(stdout);
    const raw = stdout.length > MAX_OUTPUT ? `${stdout.slice(0, MAX_OUTPUT)}\n...[truncated]` : stdout;

    return {
      ok: true,
      status: 'completed',
      operation: 'lark.cli',
      request_id: requestId,
      completed_at: new Date().toISOString(),
      intent,
      mutating_command_detected: write,
      command: args,
      cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
      data: parsed ?? raw,
      assets,
      security_model: 'lark-cli-only; native executable on Windows; admin roots/local paths blocked; writes require explicit write_authorized=true',
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function handleRequest(req) {
  const requestId = String(req?.request_id || '').trim();
  if (!requestId) throw new Error('ops-request.json missing request_id');
  const operation = String(req?.operation || '').trim();
  if (operation === 'lark.cli') return handleLarkCli(req);
  throw new Error('Unsupported operation. Allowed: lark.cli');
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (pending) {
      publishPending();
      return;
    }

    const { content } = getRepoFile(REQUEST_PATH);
    const req = JSON.parse(content);
    const id = String(req?.request_id || '').trim();
    if (!id || id === lastRequestId) return;

    log(`request ${id} received`);
    let response;
    try {
      response = handleRequest(req);
    } catch (err) {
      response = {
        ok: false,
        status: 'error',
        request_id: id,
        completed_at: new Date().toISOString(),
        message: String(err?.message || err),
      };
    }

    savePending({ id, response });
    publishPending();
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/Not Found|HTTP 404|404/.test(msg)) log(`poll error: ${msg.slice(0, 1200)}`);
  } finally {
    busy = false;
  }
}

initializeCursor();
log(`starting; repo=${REPO} branch=${BRANCH} assets=${ASSET_BRANCH} poll=${POLL_MS}ms cli=${resolveNativeLarkCli()}`);
await tick();
setInterval(tick, POLL_MS);

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${String(err?.stack || err)}`);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  log(`unhandledRejection: ${String(err?.stack || err)}`);
  process.exit(1);
});
