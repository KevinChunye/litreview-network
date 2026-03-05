/**
 * feed_refresher.js — standalone background process that periodically calls
 * POST /api/feeds/:topic/refresh for each configured topic.
 *
 * Usage:
 *   FEED_TOPICS="diffusion models,agentic retrieval" \
 *   FEED_REFRESH_HOURS=6 \
 *   FEED_API_KEY=litrev_... \
 *   node scripts/feed_refresher.js
 *
 * Or just run via npm: npm run start:feed
 * The server must be running (defaults to http://localhost:3000).
 */

'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = (process.env.LITREV_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.FEED_API_KEY || process.env.LITREV_API_KEY || '';
const REFRESH_HOURS = parseFloat(process.env.FEED_REFRESH_HOURS || '6');
const REFRESH_MS = REFRESH_HOURS * 60 * 60 * 1000;
const RATE_LIMIT_MS = parseInt(process.env.FEED_RATE_LIMIT_MS || '3000', 10); // between topics

// Parse topics from env, comma-separated
const RAW_TOPICS = process.env.FEED_TOPICS || 'transformer attention mechanisms,diffusion planning,agentic retrieval';
const TOPICS = RAW_TOPICS.split(',').map((t) => t.trim()).filter(Boolean);

function log(msg) {
  console.log(`[feed-refresher] ${new Date().toISOString()} — ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** POST to BASE_URL/api/feeds/:topic/refresh */
function postRefresh(topic) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(topic);
    const urlStr = `${BASE_URL}/api/feeds/${encoded}/refresh`;
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const body = JSON.stringify({});
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
      timeout: 60000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

/** One full refresh cycle over all topics */
async function refreshAll() {
  log(`Starting refresh cycle for ${TOPICS.length} topics: ${TOPICS.join(', ')}`);
  for (const topic of TOPICS) {
    try {
      log(`Refreshing topic: "${topic}"`);
      const res = await postRefresh(topic);
      if (res.body?.success) {
        const items = res.body.data?.items || [];
        log(`  ✓ "${topic}" → ${items.length} items stored`);
      } else {
        log(`  ✗ "${topic}" → error: ${JSON.stringify(res.body?.error || res.body)}`);
      }
    } catch (err) {
      log(`  ✗ "${topic}" → exception: ${err.message}`);
    }
    // Rate-limit between topics
    if (TOPICS.indexOf(topic) < TOPICS.length - 1) await sleep(RATE_LIMIT_MS);
  }
  log(`Refresh cycle complete. Next in ${REFRESH_HOURS}h.`);
}

async function main() {
  if (!API_KEY) {
    log('Warning: FEED_API_KEY not set — requests will be unauthenticated (may fail).');
  }
  log(`Topics: ${TOPICS.join(', ')}`);
  log(`Refresh interval: every ${REFRESH_HOURS} hours`);

  // Run once immediately, then on interval
  await refreshAll();
  setInterval(refreshAll, REFRESH_MS);
}

main().catch((err) => {
  console.error('[feed-refresher] Fatal error:', err);
  process.exit(1);
});
