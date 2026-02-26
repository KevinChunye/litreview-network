#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const mode = String(process.env.MODE || '').trim().toLowerCase();
const base = String(process.env.BASE || 'http://web:3000').trim().replace(/\/+$/, '');
const sessionPath = String(process.env.SESSION_PATH || '/tmp/litrev-session.json').trim();
const bootstrapSession = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.SESSION_BOOTSTRAP || '').trim().toLowerCase(),
);
const waitTimeoutSec = Math.max(15, Number(process.env.SESSION_WAIT_TIMEOUT_SEC || 300));

const modeKeyMap = {
  scout: 'scout_key',
  summarizer: 'summarizer_key',
  critic: 'critic_key',
  builder: 'builder_key',
};

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

function loadSession(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeSession(filePath, session) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

async function requestApi(pathname, options = {}) {
  const method = options.method || 'GET';
  const headers = { accept: 'application/json' };
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

async function waitForWebHealth() {
  const attempts = Math.max(3, Number(process.env.START_RUNNERS_HEALTH_ATTEMPTS || 60));
  const waitMs = Math.max(500, Number(process.env.START_RUNNERS_HEALTH_WAIT_MS || 1500));
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await requestApi('/api/health', { method: 'GET' });
      return;
    } catch (_) {
      if (i === attempts) throw new Error(`web not healthy at ${base}/api/health`);
      await sleep(waitMs);
    }
  }
}

async function registerAndClaim(label, description) {
  const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const name = `runner-${label}-${unique}`;
  const owner = `docker-${label}`;
  const reg = await requestApi('/api/agents/register', {
    method: 'POST',
    body: { name, description },
  });
  const apiKey = String(reg.api_key || '').trim();
  const token = parseClaimToken(reg.claim_url || '');
  if (!apiKey || !token) {
    throw new Error(`invalid register response for ${label}`);
  }
  await requestApi(`/api/agents/claim/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { owner },
  });
  return apiKey;
}

async function bootstrapNewSession() {
  console.log(`[${nowIso()}] [${mode}] bootstrapping session at ${sessionPath}`);
  const scoutKey = await registerAndClaim('scout', 'Scout runner');
  const summarizerKey = await registerAndClaim('summarizer', 'Summarizer runner');
  const criticKey = await registerAndClaim('critic', 'Critic runner');
  const builderKey = await registerAndClaim('builder', 'Builder runner');

  const room = await requestApi('/api/rooms', {
    method: 'POST',
    apiKey: summarizerKey,
    body: { topic: `Docker Live Debate Room (${nowIso()})` },
  });
  const roomId = String(room.room_id || '').trim();
  if (!roomId) throw new Error('room creation failed during bootstrap');

  const session = {
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
  writeSession(sessionPath, session);
  return session;
}

async function waitForSession() {
  const deadline = Date.now() + waitTimeoutSec * 1000;
  while (Date.now() < deadline) {
    const session = loadSession(sessionPath);
    if (session && session.room_id) return session;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for session file: ${sessionPath}`);
}

function resolveRunnerKey(session) {
  const primaryField = modeKeyMap[mode];
  if (!primaryField) {
    throw new Error(`Unsupported MODE for run_mode_from_session: ${mode}`);
  }
  const direct = String(session[primaryField] || '').trim();
  if (direct) return direct;
  if (mode === 'builder') {
    return String(session.third_key || '').trim();
  }
  return '';
}

async function main() {
  if (!mode) {
    throw new Error('MODE is required (scout|summarizer|critic|builder)');
  }

  console.log(`[${nowIso()}] [${mode}] run_mode_from_session init`);
  console.log(`[${nowIso()}] [${mode}] BASE=${base}`);
  console.log(`[${nowIso()}] [${mode}] SESSION_PATH=${sessionPath}`);
  console.log(
    `[${nowIso()}] [${mode}] DEMO_MODE=${process.env.DEMO_MODE || '0'} POLL_SECONDS=${process.env.POLL_SECONDS || '(default)'} MIN_SECONDS_BETWEEN_POSTS=${process.env.MIN_SECONDS_BETWEEN_POSTS || '(default)'}`,
  );

  await waitForWebHealth();
  let session = loadSession(sessionPath);
  if ((!session || !session.room_id) && bootstrapSession) {
    session = await bootstrapNewSession();
  } else if (!session || !session.room_id) {
    console.log(`[${nowIso()}] [${mode}] waiting for shared session...`);
    session = await waitForSession();
  }

  const roomId = String(session.room_id || '').trim();
  const apiKey = resolveRunnerKey(session);
  if (!roomId || !apiKey) {
    throw new Error(`session missing room/key for mode=${mode}`);
  }

  const env = {
    ...process.env,
    BASE: base,
    ROOM_ID: roomId,
    LITREV_API_KEY: apiKey,
  };

  const child = spawn(process.execPath, [path.join(__dirname, 'agent_runner.js')], {
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error(`[${nowIso()}] [${mode || 'unknown'}] fatal: ${error.message}`);
  process.exit(1);
});
