#!/usr/bin/env node
'use strict';

// Auto-load .env from project root (no external deps needed)
(function loadDotEnv() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
})();

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const RUNNERS = [
  { name: 'scout', mode: 'scout', keyField: 'scout' },
  { name: 'summarizer', mode: 'summarizer', keyField: 'summarizer' },
  { name: 'critic', mode: 'critic', keyField: 'critic' },
  { name: 'builder', mode: 'builder', keyField: 'builder' },
  { name: 'curator', mode: 'curator', keyField: 'curator' },
  { name: 'writer', mode: 'writer', keyField: 'writer' },
];

const base = String(process.env.BASE || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
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

function resolveKeyFromEnv(runner) {
  const lookup = {
    scout: ['LITREV_SCOUT_KEY', 'SCOUT_KEY'],
    summarizer: ['LITREV_SUMMARIZER_KEY', 'SUMMARIZER_KEY'],
    critic: ['LITREV_CRITIC_KEY', 'CRITIC_KEY'],
    builder: ['LITREV_BUILDER_KEY', 'BUILDER_KEY', 'LITREV_THIRD_KEY', 'THIRD_KEY'],
    curator: ['LITREV_CURATOR_KEY', 'CURATOR_KEY'],
    writer: ['LITREV_WRITER_KEY', 'WRITER_KEY'],
  };
  for (const envName of lookup[runner.keyField] || []) {
    const value = String(process.env[envName] || '').trim();
    if (value) return value;
  }
  return '';
}

async function ensureRunnerKeys() {
  const out = {};
  for (const runner of RUNNERS) {
    const existing = resolveKeyFromEnv(runner);
    if (existing) {
      out[runner.keyField] = existing;
      continue;
    }
    const description =
      runner.name === 'scout'
        ? 'Scout runner: fetches and prioritizes paper recommendations.'
        : runner.name === 'summarizer'
          ? 'Summarizer runner: creates grounded structured summaries.'
          : runner.name === 'critic'
            ? 'Critic runner: tests claims and ablations.'
            : runner.name === 'curator'
              ? 'Curator runner: synthesizes summaries and critiques into a related-work narrative.'
              : runner.name === 'writer'
                ? 'Writer runner: drafts formal paper sections (abstract, intro, related work, discussion).'
                : 'Builder runner: proposes next experiments and implementation steps.';
    out[runner.keyField] = await registerAndClaim(runner.name, description);
  }
  return out;
}

async function main() {
  if (!mockOpenAI && !String(process.env.OPENAI_API_KEY || '').trim()) {
    throw new Error('Missing OPENAI_API_KEY (or set MOCK_OPENAI=1).');
  }

  console.log(`[${nowIso()}] start:runners init`);
  console.log(`BASE=${base}`);
  console.log(`DEMO_MODE=${demoMode ? '1' : '0'}`);
  console.log(`POLL_SECONDS=${effectivePollSeconds}`);
  console.log(`MIN_SECONDS_BETWEEN_POSTS=${effectiveCooldownSeconds}`);
  console.log('Room assignment is server-managed. Use UI button "Attach runners to this room".');

  await waitForHealthz();
  const keys = await ensureRunnerKeys();

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
    const apiKey = String(keys[runner.keyField] || '').trim();
    if (!apiKey) throw new Error(`Missing key for runner=${runner.name}`);
    const runnerId = `runner-${runner.name}-${randomUUID().slice(0, 8)}`;

    const env = {
      ...process.env,
      BASE: base,
      MODE: runner.mode,
      RUNNER_ID: runnerId,
      LITREV_API_KEY: apiKey,
      DEMO_MODE: demoMode ? '1' : '0',
      POLL_SECONDS: String(effectivePollSeconds),
      MIN_SECONDS_BETWEEN_POSTS: String(effectiveCooldownSeconds),
    };

    const child = spawn(process.execPath, [require('path').join(__dirname, 'agent_runner.js')], {
      env,
      stdio: 'inherit',
    });
    children.push(child);
    console.log(`[${nowIso()}] started ${runner.name} runner pid=${child.pid} runner_id=${runnerId}`);

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
