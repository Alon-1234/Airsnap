#!/usr/bin/env node
/**
 * ============================================================
 *  AirSnap — one-click launcher
 * ============================================================
 *  Starts everything needed to use / demo AirSnap:
 *
 *    • the mobile app (Expo) — in your browser AND on your phone
 *      via Expo Go (QR code in this window)
 *    • the simulation server — the always-on cloud server on
 *      Render (default), or a copy on this laptop ("local" mode)
 *    • the live drone viewer website
 *
 *  Usage
 *    node scripts/start-all.js            cloud server (default)
 *    node scripts/start-all.js local      run the server on this laptop
 *    options: --tunnel      phone on a different network than the laptop
 *             --no-browser  don't open browser tabs
 *
 *  Double-click "Start AirSnap.bat" on Windows, or press ▶ in
 *  VS Code (Run and Debug → "AirSnap: Start everything").
 *  Press Ctrl+C in this window to stop everything.
 * ============================================================
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'airsnap-server');
const CLOUD_URL = 'https://airsnap-faeg.onrender.com';
const APP_PORT = 8081;
const SERVER_PORT = 4000;

const args = process.argv.slice(2).map((a) => a.toLowerCase());
const LOCAL = args.includes('local') || args.includes('--local');
const TUNNEL = args.includes('--tunnel') || args.includes('tunnel');
const OPEN_BROWSER = !args.includes('--no-browser');
const IS_WIN = process.platform === 'win32';

// ── Pretty output ────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'),
  yellow: paint('33'), blue: paint('34'), magenta: paint('35'), cyan: paint('36'),
};
const step = (msg) => console.log(`${c.cyan('›')} ${msg}`);
const ok = (msg) => console.log(`${c.green('✔')} ${msg}`);
const warn = (msg) => console.log(`${c.yellow('!')} ${msg}`);
const fail = (msg) => console.log(`${c.red('✖')} ${msg}`);

// ── Child process bookkeeping ────────────────────────────
const children = [];
let shuttingDown = false;

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch (_) {
    try { child.kill('SIGTERM'); } catch (__) { /* already gone */ }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${c.dim('Stopping AirSnap…')}`);
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

// ── Small helpers ────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 4096) body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false); });
  });
}

async function waitFor(check, { timeoutMs, intervalMs = 1500 }) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (shuttingDown) return false;
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function lanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Skip virtual adapters (WSL, Hyper-V, VirtualBox, VPNs) when possible.
      const virtual = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|tailscale|zerotier/i.test(name);
      const privateRange = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      candidates.push({ address: a.address, score: (virtual ? 0 : 2) + (privateRange ? 1 : 0) });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0]?.address || 'localhost';
}

function openUrl(url) {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch (_) {
    warn(`Couldn't open a browser — go to ${url}`);
  }
}

function readDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function prefixStream(stream, label) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) if (line.trim()) console.log(`${label} ${line}`);
  });
}

// ── Steps ────────────────────────────────────────────────
function ensureDependencies() {
  const missing = [];
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'expo'))) missing.push(ROOT);
  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules', 'express'))) missing.push(SERVER_DIR);
  for (const dir of missing) {
    step(`First run — installing packages in ${path.relative(ROOT, dir) || 'app'} (takes a few minutes)…`);
    const npm = IS_WIN ? 'npm.cmd' : 'npm';
    const r = spawnSync(npm, ['install'], { cwd: dir, stdio: 'inherit', shell: IS_WIN });
    if (r.status !== 0) {
      fail('npm install failed. Check your internet connection and try again.');
      process.exit(1);
    }
  }
  if (!missing.length) ok('Packages installed');
}

async function wakeCloudServer() {
  step(`Waking the cloud server (${CLOUD_URL}) — can take ~1 min if it was asleep…`);
  const awake = await waitFor(async () => {
    const r = await httpGet(`${CLOUD_URL}/health`, 15000);
    return r && r.status === 200;
  }, { timeoutMs: 120000, intervalMs: 3000 });
  if (awake) {
    const hives = await httpGet(`${CLOUD_URL}/health`);
    let info = '';
    try { info = ` (${JSON.parse(hives.body).hives} hives)`; } catch (_) { /* ignore */ }
    ok(`Cloud server is up${info}`);
  } else {
    warn('Cloud server did not answer yet — the app will keep retrying. Check your internet.');
  }
}

async function startLocalServer() {
  if (await portInUse(SERVER_PORT)) {
    const r = await httpGet(`http://localhost:${SERVER_PORT}/health`);
    if (r && r.status === 200 && r.body.includes('"ok"')) {
      ok(`Local server already running on port ${SERVER_PORT} — reusing it`);
      return;
    }
    fail(`Port ${SERVER_PORT} is used by another program. Close it and try again.`);
    shutdown(1);
    return;
  }

  // Sensible defaults for anything airsnap-server/.env doesn't set.
  // (dotenv never overrides variables we pass in, so only fill gaps.)
  const fileEnv = readDotEnv(path.join(SERVER_DIR, '.env'));
  const defaults = {
    PORT: String(SERVER_PORT),
    FIREBASE_PROJECT_ID: 'airsnap-7844f',
    ADMIN_EMAILS: 'akonk13579@gmail.com',
  };
  const env = { ...process.env };
  for (const [k, v] of Object.entries(defaults)) if (!fileEnv[k] && !env[k]) env[k] = v;
  env.PORT = String(SERVER_PORT);

  if (!fileEnv.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    warn('No FIREBASE_SERVICE_ACCOUNT in airsnap-server/.env — sign-in works, but credits,');
    warn('orders and promo codes need it on a local server (see SETUP.md §4).');
  }

  step(`Starting the local simulation server on port ${SERVER_PORT}…`);
  const server = spawn(process.execPath, ['index.js'], {
    cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WIN,
  });
  children.push(server);
  prefixStream(server.stdout, c.magenta('[server]'));
  prefixStream(server.stderr, c.magenta('[server]'));
  server.on('exit', (code) => {
    if (!shuttingDown) {
      fail(`Local server stopped (exit code ${code}).`);
      shutdown(1);
    }
  });

  const up = await waitFor(async () => {
    const r = await httpGet(`http://localhost:${SERVER_PORT}/health`, 2000);
    return r && r.status === 200;
  }, { timeoutMs: 30000, intervalMs: 500 });
  if (up) ok(`Local server is up → http://localhost:${SERVER_PORT}`);
  else { fail('Local server did not start — see the [server] lines above.'); shutdown(1); }
}

async function startApp(apiUrl) {
  if (await portInUse(APP_PORT)) {
    const r = await httpGet(`http://localhost:${APP_PORT}`);
    if (r && r.status === 200) {
      warn(`The app is already running on port ${APP_PORT} (another AirSnap window?) — reusing it.`);
      warn('Close that window first if you want to restart it in a different mode.');
      return 'reused';
    }
    fail(`Port ${APP_PORT} is used by another program. Close it and try again.`);
    shutdown(1);
    return 'failed';
  }

  const expoCli = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
  const expoArgs = [expoCli, 'start', '--port', String(APP_PORT)];
  if (TUNNEL) expoArgs.push('--tunnel');

  // No --web flag: Expo still serves the browser build on APP_PORT, and
  // we open the tab ourselves once it's ready (so it isn't opened twice).
  const env = { ...process.env, EXPO_NO_TELEMETRY: '1' };
  if (apiUrl) env.EXPO_PUBLIC_API_URL = apiUrl;
  else delete env.EXPO_PUBLIC_API_URL;

  step('Starting the app (Expo)…');
  // Inherit the terminal so Expo can draw its QR code and keyboard menu.
  const expo = spawn(process.execPath, expoArgs, { cwd: ROOT, env, stdio: 'inherit' });
  children.push(expo);
  expo.on('exit', (code) => {
    if (!shuttingDown) {
      if (code) fail(`The app server stopped (exit code ${code}).`);
      shutdown(code || 0);
    }
  });

  const up = await waitFor(async () => {
    const r = await httpGet(`http://localhost:${APP_PORT}`, 3000);
    return r && r.status === 200;
  }, { timeoutMs: 180000, intervalMs: 1500 });
  if (!up) {
    fail('The app did not start within 3 minutes — see the messages above.');
    return 'failed';
  }
  return 'started';
}

function printSummary({ viewerUrl, apiUrl }) {
  const line = c.dim('─'.repeat(64));
  console.log(`\n${line}`);
  console.log(`  ${c.bold(c.green('AirSnap is running'))}  ${c.dim(LOCAL ? '(local server)' : '(cloud server)')}`);
  console.log(line);
  console.log(`  ${c.bold('App in your browser')}   http://localhost:${APP_PORT}`);
  console.log(`  ${c.bold('App on your phone')}     open Expo Go and scan the QR code above`);
  console.log(`  ${c.bold('Live drone viewer')}     ${viewerUrl}`);
  console.log(`  ${c.bold('Server API')}            ${apiUrl}`);
  console.log(line);
  console.log(`  In this window: ${c.cyan('r')} reload app · ${c.cyan('w')} open web · ${c.cyan('Ctrl+C')} stop everything`);
  if (LOCAL) {
    console.log(c.dim('  Phone can\'t reach the local server? Allow Node.js through Windows Firewall'));
    console.log(c.dim('  (Private networks) and make sure the phone is on the same Wi-Fi.'));
  }
  console.log(`${line}\n`);
}

// ── Main ─────────────────────────────────────────────────
(async () => {
  console.log(`\n  ${c.bold(c.blue('Air') + c.cyan('Snap'))} ${c.dim('— starting everything')}\n`);

  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    fail(`Node.js ${process.versions.node} is too old — install Node 20 or newer from https://nodejs.org`);
    process.exit(1);
  }

  ensureDependencies();

  let apiUrl;
  let viewerUrl;
  if (LOCAL) {
    await startLocalServer();
    if (shuttingDown) return;
    const ip = lanIp();
    apiUrl = `http://${ip}:${SERVER_PORT}`;
    viewerUrl = `http://localhost:${SERVER_PORT}`;
  } else {
    apiUrl = CLOUD_URL;
    viewerUrl = CLOUD_URL;
    // Wake the sleeping free-tier server while Expo boots.
    wakeCloudServer();
  }

  const app = await startApp(LOCAL ? apiUrl : null);
  if (shuttingDown || app === 'failed') return;

  printSummary({ viewerUrl, apiUrl });
  if (OPEN_BROWSER) {
    openUrl(`http://localhost:${APP_PORT}`);
    openUrl(viewerUrl);
  }

  if (app === 'reused') {
    console.log(c.dim('Opened the already-running app. This window will close in a few seconds.'));
    setTimeout(() => process.exit(0), 5000);
  }
})().catch((e) => {
  fail(e.stack || e.message);
  shutdown(1);
});
