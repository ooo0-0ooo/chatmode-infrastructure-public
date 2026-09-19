import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.LARK_BRIDGE_REPO || 'your-account/your-private-runtime-repo';
const BRANCH = process.env.LARK_BRIDGE_BRANCH || 'runtime';
const REQUEST_PATH = process.env.LARK_BRIDGE_V2_AUTH_REQUEST_PATH || 'bridge/v2/auth-request.json';
const RESPONSE_PATH = process.env.LARK_BRIDGE_V2_AUTH_RESPONSE_PATH || 'bridge/v2/auth-response.json';
const POLL_MS = Math.max(3000, Number(process.env.LARK_BRIDGE_POLL_MS || 5000));
const LARK_CLI_ENV = process.env.LARK_CLI_PATH || 'lark-cli';
const GH = process.env.GH_PATH || 'gh';
const PENDING_PATH = join(DIR, '.auth-v2-pending.json');
const AUTH_SESSION_PATH = join(DIR, '.auth-v2-session.json');
const KEEPALIVE_CHECK_MS = Math.max(60_000, Number(process.env.LARK_BRIDGE_AUTH_KEEPALIVE_CHECK_MS || 6 * 60 * 60 * 1000));
const KEEPALIVE_REFRESH_BEFORE_MS = Math.max(6 * 60 * 60 * 1000, Number(process.env.LARK_BRIDGE_AUTH_KEEPALIVE_REFRESH_BEFORE_MS || 72 * 60 * 60 * 1000));
const KEEPALIVE_INITIAL_DELAY_MS = Math.max(10_000, Number(process.env.LARK_BRIDGE_AUTH_KEEPALIVE_INITIAL_DELAY_MS || 30_000));

let lastRequestId = null;
let busy = false;
let pending = loadPending();
let authSession = loadAuthSession();
let keepaliveBusy = false;

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] auth-v2: ${msg}\n`);
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

function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    ...opts,
  });
  if (r.error) {
    const code = r.error.code ? ` (${r.error.code})` : '';
    throw new Error(`Failed to run ${cmd}${code}: ${r.error.message}`);
  }
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function run(cmd, args, opts = {}) {
  const r = runCapture(cmd, args, opts);
  if (r.status !== 0) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `${cmd} exited with code ${r.status}`);
  }
  return r.stdout;
}

function ghApi(args, inputObj = null) {
  return run(
    GH,
    ['api', ...args, ...(inputObj ? ['--input', '-'] : [])],
    inputObj ? { input: JSON.stringify(inputObj), timeout: 45_000 } : { timeout: 45_000 },
  );
}

function getRepoFile(path) {
  const raw = ghApi(['-X', 'GET', `repos/${REPO}/contents/${path}`, '-f', `ref=${BRANCH}`]);
  const obj = JSON.parse(raw);
  const content = Buffer.from(String(obj.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { sha: obj.sha, content };
}

function putRepoFile(path, text, message) {
  let sha = null;
  try { sha = getRepoFile(path).sha; } catch {}
  const body = { message, content: Buffer.from(text, 'utf8').toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  ghApi(['-X', 'PUT', `repos/${REPO}/contents/${path}`], body);
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function parseFirstJson(...values) {
  for (const value of values) {
    if (!value) continue;
    const direct = parseJsonLoose(value);
    if (direct) return direct;
    for (const line of String(value).split(/\r?\n/).reverse()) {
      const parsed = parseJsonLoose(line.trim());
      if (parsed) return parsed;
    }
  }
  return null;
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

function loadAuthSession() {
  try {
    if (!existsSync(AUTH_SESSION_PATH)) return null;
    const obj = JSON.parse(readFileSync(AUTH_SESSION_PATH, 'utf8'));
    if (!obj?.session_id || !obj?.device_code || !obj?.expires_at) return null;
    if (Date.parse(obj.expires_at) <= Date.now()) {
      try { unlinkSync(AUTH_SESSION_PATH); } catch {}
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

function saveAuthSession(value) {
  authSession = value;
  writeFileSync(AUTH_SESSION_PATH, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
}

function clearAuthSession(expectedSessionId = null) {
  if (expectedSessionId && authSession?.session_id !== expectedSessionId) return;
  authSession = null;
  try { unlinkSync(AUTH_SESSION_PATH); } catch {}
}

function normalizeAuthSessionId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('auth.finish_pending requires auth_session_id');
  if (id.length > 128 || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Blocked invalid auth_session_id');
  return id;
}

function initializeCursor() {
  try {
    const response = JSON.parse(getRepoFile(RESPONSE_PATH).content);
    lastRequestId = String(response?.request_id || '').trim() || null;
  } catch {}
}

function publishPending() {
  if (!pending) return;
  putRepoFile(RESPONSE_PATH, JSON.stringify(pending.response, null, 2), `lark-bridge-v2-auth: respond ${pending.id}`);
  lastRequestId = pending.id;
  log(`request ${pending.id} -> ${pending.response.status}`);
  clearPending();
}

function normalizeScopes(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).filter(Boolean);
  const scopes = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  if (scopes.length === 0) throw new Error('auth.start requires at least one exact OAuth scope');
  if (scopes.length > 50) throw new Error('auth.start accepts at most 50 exact scopes per request; use auth.start_all for broad authorization');
  for (const scope of scopes) {
    if (scope.length > 160 || !/^[A-Za-z0-9_.:-]+$/.test(scope)) {
      throw new Error(`Blocked invalid OAuth scope: ${JSON.stringify(scope)}`);
    }
  }
  return scopes;
}

function cli() {
  return resolveNativeLarkCli();
}

function authStatus(requestId) {
  const out = run(cli(), ['auth', 'status', '--json', '--verify']);
  const parsed = parseJsonLoose(out) ?? out;
  return {
    ok: true,
    status: 'completed',
    operation: 'auth.status',
    request_id: requestId,
    completed_at: new Date().toISOString(),
    scope_source: 'current_user_access_token_when_identity=user',
    cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
    data: parsed,
  };
}

function authScopes(requestId) {
  const out = run(cli(), ['auth', 'scopes', '--json']);
  return {
    ok: true,
    status: 'completed',
    operation: 'auth.scopes',
    request_id: requestId,
    completed_at: new Date().toISOString(),
    scope_source: 'app_enabled_scopes_not_current_access_token',
    warning: 'Use auth.status --verify to inspect the current user access token scope. auth.scopes reports scopes enabled for the Lark app.',
    cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
    data: parseJsonLoose(out) ?? out,
  };
}

function startFromCapture(requestId, operation, r, extra = {}) {
  const parsed = parseFirstJson(r.stdout, r.stderr);
  if (!parsed?.verification_url || !parsed?.device_code) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `${operation} did not return verification_url/device_code`);
  }

  const expiresIn = Math.max(60, Number(parsed.expires_in || 240));
  const sessionId = randomUUID();
  saveAuthSession({
    session_id: sessionId,
    request_id: requestId,
    operation,
    device_code: parsed.device_code,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });

  return {
    ok: true,
    status: 'awaiting_user_authorization',
    operation,
    request_id: requestId,
    completed_at: new Date().toISOString(),
    verification_url: parsed.verification_url,
    auth_session_id: sessionId,
    expires_in: expiresIn,
    cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
    oauth_secret_handling: 'device_code stored only on Windows host; never written to GitHub',
    ...extra,
  };
}

function authStart(requestId, req) {
  const scopes = normalizeScopes(req?.scopes);
  const r = runCapture(cli(), ['auth', 'login', '--scope', scopes.join(','), '--no-wait', '--json']);
  return startFromCapture(requestId, 'auth.start', r, {
    scopes_requested: scopes,
    security_model: 'exact-scopes-only; no arbitrary command execution',
  });
}

function authStartAll(requestId) {
  const r = runCapture(cli(), ['auth', 'login', '--domain', 'all', '--scope', 'offline_access', '--no-wait', '--json']);
  return startFromCapture(requestId, 'auth.start_all', r, {
    authorization_mode: 'all-known-user-domains-plus-offline_access',
    security_model: 'broad Lark user OAuth only; no arbitrary shell or non-lark executable access',
  });
}

function finishDeviceCode(requestId, operation, deviceCode) {
  const r = runCapture(cli(), ['auth', 'login', '--device-code', deviceCode, '--json'], { timeout: 120_000 });
  const parsed = parseFirstJson(r.stdout, r.stderr);

  if (parsed?.event === 'authorization_complete') {
    const missing = Array.isArray(parsed.missing) ? parsed.missing : [];
    return {
      ok: true,
      status: missing.length ? 'completed_with_missing_scopes' : 'completed',
      operation,
      request_id: requestId,
      completed_at: new Date().toISOString(),
      exit_code: r.status,
      missing_scopes: missing,
      data: parsed,
      cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
      oauth_secret_handling: 'device_code remained local to Windows host',
      note: missing.length
        ? 'Authorization completed, but Lark did not grant every requested scope. Verify the real token with auth.status before deciding whether this blocks the requested document operation.'
        : undefined,
    };
  }

  if (r.status !== 0) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `${operation} exited with code ${r.status}`);
  }

  return {
    ok: true,
    status: 'completed',
    operation,
    request_id: requestId,
    completed_at: new Date().toISOString(),
    exit_code: r.status,
    data: parsed ?? r.stdout,
    cli_transport: process.platform === 'win32' ? 'native-lark-cli-exe' : 'direct',
    oauth_secret_handling: 'device_code remained local to Windows host',
  };
}

function authFinishPending(requestId, req) {
  const sessionId = normalizeAuthSessionId(req?.auth_session_id);
  authSession = loadAuthSession();
  if (!authSession) throw new Error('No unexpired local OAuth session is pending. Start a new authorization with auth.start or auth.start_all.');
  if (authSession.session_id !== sessionId) throw new Error('auth_session_id does not match the pending local OAuth session.');
  if (Date.parse(authSession.expires_at) <= Date.now()) {
    clearAuthSession(sessionId);
    throw new Error('Pending OAuth session expired. Start a new authorization.');
  }

  try {
    return finishDeviceCode(requestId, 'auth.finish_pending', authSession.device_code);
  } finally {
    clearAuthSession(sessionId);
  }
}

function localAuthSnapshot() {
  const r = runCapture(cli(), ['auth', 'status', '--json']);
  if (r.status !== 0) {
    const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    throw new Error(text || `auth status exited with code ${r.status}`);
  }
  const parsed = parseFirstJson(r.stdout, r.stderr);
  if (!parsed) throw new Error('auth status did not return JSON');
  return parsed;
}

function keepaliveDecision(snapshot) {
  const user = snapshot?.identities?.user || {};
  const tokenStatus = String(user.tokenStatus || '').trim();
  const status = String(user.status || '').trim();
  const refreshExpiresAt = String(user.refreshExpiresAt || '').trim();
  const refreshMs = refreshExpiresAt ? Date.parse(refreshExpiresAt) : NaN;
  const remainingMs = Number.isFinite(refreshMs) ? refreshMs - Date.now() : null;

  if (!user.openId || status === 'missing' || status === 'not_configured' || !tokenStatus) {
    return { action: 'needs_user_authorization', token_status: tokenStatus || null, refresh_expires_at: refreshExpiresAt || null, remaining_ms: remainingMs };
  }
  if (Number.isFinite(refreshMs) && remainingMs <= 0) {
    return { action: 'needs_user_authorization', token_status: tokenStatus, refresh_expires_at: refreshExpiresAt, remaining_ms: remainingMs };
  }
  if (tokenStatus === 'needs_refresh' && (!Number.isFinite(refreshMs) || remainingMs <= KEEPALIVE_REFRESH_BEFORE_MS)) {
    return { action: 'refresh_now', token_status: tokenStatus, refresh_expires_at: refreshExpiresAt || null, remaining_ms: remainingMs };
  }
  return { action: 'healthy', token_status: tokenStatus, refresh_expires_at: refreshExpiresAt || null, remaining_ms: remainingMs };
}

function runKeepalive(trigger = 'timer') {
  if (keepaliveBusy) return { ok: true, status: 'skipped_busy', trigger };
  keepaliveBusy = true;
  try {
    const before = localAuthSnapshot();
    const decision = keepaliveDecision(before);
    if (decision.action !== 'refresh_now') {
      log(`keepalive ${trigger}: ${decision.action}; token=${decision.token_status || 'none'} refresh_expires_at=${decision.refresh_expires_at || 'none'}`);
      return { ok: decision.action === 'healthy', status: decision.action, trigger, decision, before };
    }

    const verify = runCapture(cli(), ['auth', 'status', '--json', '--verify']);
    if (verify.status !== 0) {
      const text = [verify.stdout, verify.stderr].filter(Boolean).join('\n').trim();
      throw new Error(text || `auth status --verify exited with code ${verify.status}`);
    }
    const after = parseFirstJson(verify.stdout, verify.stderr);
    const afterDecision = keepaliveDecision(after);
    log(`keepalive ${trigger}: refreshed; refresh_expires_at=${afterDecision.refresh_expires_at || 'none'}`);
    return { ok: true, status: 'refreshed', trigger, before: decision, after: afterDecision };
  } catch (err) {
    log(`keepalive ${trigger} error: ${String(err?.message || err).slice(0, 800)}`);
    return { ok: false, status: 'error', trigger, message: String(err?.message || err) };
  } finally {
    keepaliveBusy = false;
  }
}

function authHealth(requestId) {
  const snapshot = localAuthSnapshot();
  const decision = keepaliveDecision(snapshot);
  return {
    ok: decision.action === 'healthy' || decision.action === 'refresh_now',
    status: 'completed',
    operation: 'auth.health',
    request_id: requestId,
    completed_at: new Date().toISOString(),
    keepalive: {
      check_interval_ms: KEEPALIVE_CHECK_MS,
      refresh_before_ms: KEEPALIVE_REFRESH_BEFORE_MS,
      decision,
    },
    data: snapshot,
  };
}

function authKeepalive(requestId) {
  return {
    operation: 'auth.keepalive',
    request_id: requestId,
    completed_at: new Date().toISOString(),
    ...runKeepalive('mailbox'),
  };
}

function handleRequest(req) {
  const requestId = String(req?.request_id || '').trim();
  if (!requestId) throw new Error('auth-request.json missing request_id');
  const operation = String(req?.operation || '').trim();
  if (operation === 'auth.status') return authStatus(requestId);
  if (operation === 'auth.scopes') return authScopes(requestId);
  if (operation === 'auth.start') return authStart(requestId, req);
  if (operation === 'auth.start_all') return authStartAll(requestId);
  if (operation === 'auth.finish_pending') return authFinishPending(requestId, req);
  if (operation === 'auth.health') return authHealth(requestId);
  if (operation === 'auth.keepalive') return authKeepalive(requestId);
  if (operation === 'idle') return { ok: true, status: 'idle', operation, request_id: requestId, completed_at: new Date().toISOString() };
  throw new Error('Unsupported auth operation. Allowed: auth.status, auth.scopes, auth.start, auth.start_all, auth.finish_pending, auth.health, auth.keepalive');
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
log(`starting; repo=${REPO} branch=${BRANCH} poll=${POLL_MS}ms cli=${resolveNativeLarkCli()}`);
await tick();
setInterval(tick, POLL_MS);
setTimeout(() => runKeepalive('startup'), KEEPALIVE_INITIAL_DELAY_MS).unref?.();
setInterval(() => runKeepalive('timer'), KEEPALIVE_CHECK_MS).unref?.();

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${String(err?.stack || err)}`);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  log(`unhandledRejection: ${String(err?.stack || err)}`);
  process.exit(1);
});
