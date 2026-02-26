#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const RUNNERS = [
  { name: 'scout', mode: 'scout', keyField: 'scout_key' },
  { name: 'summarizer', mode: 'summarizer', keyField: 'summarizer_key' },
  { name: 'critic', mode: 'critic', keyField: 'critic_key' },
  { name: 'builder', mode: 'builder', keyField: 'builder_key' },
];

const base = String(process.env.BASE || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
const sessionPath = String(process.env.SESSION_PATH || '/tmp/litrev-session.json').trim();
const demoMode = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.DEMO_MODE || '').trim().toLowerCase(),
);
const mockOpenAI = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MOCK_OPENAI || '').trim().toLowerCase(),
);
const effectivePollSeconds = Number(process.env.POLL_SECONDS || (demoMode ? 1 : 10));
const effectiveCooldownSeconds = Number(
  process.env.MIN_SECONDS_BETWEEN_POSTS || (demoMode ? 3 : 20),
);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClaimToken(claimUrl) {
  const text = String(claimUrl || '').trim();
  if (!text) return '';
  const chunks = text.split('/').filter(Boolean);
  return chunks.length ? chunks[chunks.length - 1] : '';
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function requestApi(pathname, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    accept: 'application/json',
  };
  if (options.apiKey) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }

  let body;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RUNNER_HTTP_TIMEOUT_MS || 15000));
  try {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const raw = await res.text();
    let payload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (_) {
        throw new Error(`Invalid JSON from ${pathname}: ${raw.slice(0, 240)}`);
      }
    }
    if (!res.ok || payload.success === false) {
      const err = new Error(payload.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.hint = payload.hint || '';
      throw err;
    }
    return payload.data || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealthz() {
  const attempts = Math.max(3, Number(process.env.START_RUNNERS_HEALTH_ATTEMPTS || 45));
  const waitMs = Math.max(500, Number(process.env.START_RUNNERS_HEALTH_WAIT_MS || 2000));
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await requestApi('/api/healthz', { method: 'GET' });
      return;
    } catch (error) {
      if (i === attempts) throw error;
      console.log(`[${nowIso()}] waiting for web service (${i}/${attempts}) at ${base}/api/healthz`);
      await sleep(waitMs);
    }
  }
}

async function registerAndClaim(label, description) {
  const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const name = `runner-${label}-${unique}`;
  const owner = `start-runners-${label}`;

  const reg = await requestApi('/api/agents/register', {
    method: 'POST',
    body: { name, description },
  });
  const apiKey = String(reg.api_key || '').trim();
  const claimUrl = String(reg.claim_url || '').trim();
  const token = parseClaimToken(claimUrl);
  if (!apiKey || !token) {
    throw new Error(`register/claim data missing for ${label}`);
  }

  await requestApi(`/api/agents/claim/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { owner },
  });
  return apiKey;
}

function sessionHasKeys(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.room_id) return false;
  return RUNNERS.every((runner) => Boolean(String(session[runner.keyField] || '').trim()));
}

async function bootstrapSession() {
  console.log(`[${nowIso()}] bootstrapping runner session via API endpoints...`);
  const scoutKey = await registerAndClaim(
    'scout',
    'Scout runner: finds recent papers and recommends focus papers.',
  );
  const summarizerKey = await registerAndClaim(
    'summarizer',
    'Summarizer runner: summarizes methods/claims from selected papers.',
  );
  const criticKey = await registerAndClaim(
    'critic',
    'Critic runner: identifies confounds and ablation gaps.',
  );
  const builderKey = await registerAndClaim(
    'builder',
    'Builder runner: proposes experiments and implementation next steps.',
  );

  const room = await requestApi('/api/rooms', {
    method: 'POST',
    apiKey: summarizerKey,
    body: { topic: `Railway Live Debate Room (${new Date().toISOString()})` },
  });
  const roomId = String(room.room_id || '').trim();
  if (!roomId) {
    throw new Error('Failed to create room during bootstrap.');
  }

  return {
    base,
    room_id: roomId,
    scout_key: scoutKey,
    summarizer_key: summarizerKey,
    critic_key: criticKey,
    builder_key: builderKey,
    third_key: builderKey,
    third_mode: 'builder',
    created_at: nowIso(),
  };
}

function loadSessionFromDisk(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeSessionToDisk(filePath, session) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

async function ensureSession(filePath) {
  const existing = loadSessionFromDisk(filePath);
  if (sessionHasKeys(existing)) {
    const next = { ...existing, base };
    writeSessionToDisk(filePath, next);
    return next;
  }
  const session = await bootstrapSession();
  writeSessionToDisk(filePath, session);
  return session;
}

async function main() {
  if (!mockOpenAI && !String(process.env.OPENAI_API_KEY || '').trim()) {
    throw new Error('Missing OPENAI_API_KEY (or set MOCK_OPENAI=1).');
  }

  console.log(`[${nowIso()}] start:runners init`);
  console.log(`BASE=${base}`);
  console.log(`SESSION_PATH=${sessionPath}`);
  console.log(`DEMO_MODE=${demoMode ? '1' : '0'}`);
  console.log(`POLL_SECONDS=${effectivePollSeconds}`);
  console.log(`MIN_SECONDS_BETWEEN_POSTS=${effectiveCooldownSeconds}`);

  await waitForHealthz();
  const session = await ensureSession(sessionPath);
  console.log(`[${nowIso()}] session ready: room_id=${session.room_id}`);

  const children = [];
  let shuttingDown = false;

  function shutdownAll(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (reason) {
      console.log(`[${nowIso()}] shutting down runners (${reason})`);
    }
    for (const child of children) {
      try {
        child.kill('SIGTERM');
      } catch (_) {
        // no-op
      }
    }
    setTimeout(() => process.exit(0), 300);
  }

  process.on('SIGINT', () => shutdownAll('SIGINT'));
  process.on('SIGTERM', () => shutdownAll('SIGTERM'));

  for (const runner of RUNNERS) {
    const apiKey = String(session[runner.keyField] || '').trim();
    if (!apiKey) {
      throw new Error(`Session missing required key: ${runner.keyField}`);
    }

    const env = {
      ...process.env,
      BASE: base,
      ROOM_ID: String(session.room_id || '').trim(),
      MODE: runner.mode,
      LITREV_API_KEY: apiKey,
      DEMO_MODE: demoMode ? '1' : '0',
      POLL_SECONDS: String(effectivePollSeconds),
      MIN_SECONDS_BETWEEN_POSTS: String(effectiveCooldownSeconds),
    };

    const child = spawn(process.execPath, [path.join(__dirname, 'agent_runner.js')], {
      env,
      stdio: 'inherit',
    });
    children.push(child);
    console.log(`[${nowIso()}] started ${runner.name} runner pid=${child.pid}`);

    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      const reason = `runner ${runner.name} exited (code=${code}, signal=${signal || 'none'})`;
      console.error(`[${nowIso()}] ${reason}`);
      shutdownAll(reason);
      process.exit(code && code > 0 ? code : 1);
    });
  }
}

main().catch((error) => {
  console.error(`[${nowIso()}] start:runners fatal: ${error.message}`);
  process.exit(1);
});
