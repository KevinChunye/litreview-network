/**
 * tests/smoke_feed.js — smoke test for the Paper Feed pipeline.
 *
 * Usage:
 *   LITREV_API_KEY=litrev_... node tests/smoke_feed.js
 *   LITREV_API_KEY=litrev_... FEED_TOPIC="diffusion planning" node tests/smoke_feed.js
 *
 * Expected output:
 *   ✓ GET /api/feeds/:topic → empty or cached
 *   ✓ POST /api/feeds/:topic/refresh → 5 PaperItems
 *   ✓ Each item has: id, title, tldr_1, why_recommended[], url_abs
 */

'use strict';

const http = require('http');

const BASE_URL = (process.env.LITREV_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.LITREV_API_KEY || process.env.FEED_API_KEY || '';
const TOPIC = process.env.FEED_TOPIC || 'transformer attention mechanisms';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
        ...(bodyStr ? { 'content-length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log(`\n=== Paper Feed Smoke Test ===`);
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Topic    : ${TOPIC}`);
  console.log(`API key  : ${API_KEY ? API_KEY.slice(0, 16) + '…' : '(none — will fail auth)'}\n`);

  // ── Test 1: GET returns valid shape ──────────────────────────────────────
  console.log('Test 1: GET /api/feeds/:topic');
  const encoded = encodeURIComponent(TOPIC);
  const g = await httpRequest(`/api/feeds/${encoded}`);
  assert(g.status === 200, `HTTP 200 (got ${g.status})`);
  assert(g.json?.success === true, 'success: true');
  assert(Array.isArray(g.json?.data?.items), 'data.items is array');
  console.log(`        → ${g.json?.data?.items?.length ?? '?'} cached items\n`);

  // ── Test 2: POST refresh returns 5 items ─────────────────────────────────
  console.log('Test 2: POST /api/feeds/:topic/refresh');
  console.log('        (hitting arXiv — may take up to 15s…)');
  const r = await httpRequest(`/api/feeds/${encoded}/refresh`, 'POST', {});
  assert(r.status === 200, `HTTP 200 (got ${r.status})`);
  assert(r.json?.success === true, 'success: true');
  const items = r.json?.data?.items || [];
  assert(items.length > 0, `items.length > 0 (got ${items.length})`);
  assert(items.length <= 5, `items.length <= 5 (got ${items.length})`);
  console.log(`        → ${items.length} items returned\n`);

  // ── Test 3: PaperItem schema check ───────────────────────────────────────
  console.log('Test 3: PaperItem schema for each item');
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    const label = `[${i + 1}] "${(p.title || '').slice(0, 50)}"`;
    console.log(`\n${label}`);
    assert(typeof p.id === 'string' && p.id.startsWith('arxiv:'), 'id starts with arxiv:');
    assert(typeof p.title === 'string' && p.title.length > 0, 'title non-empty');
    assert(typeof p.tldr_1 === 'string' && p.tldr_1.length > 0, 'tldr_1 non-empty');
    assert(Array.isArray(p.why_recommended) && p.why_recommended.length > 0, 'why_recommended non-empty');
    assert(typeof p.url_abs === 'string' && p.url_abs.includes('arxiv.org'), 'url_abs valid');
    assert(typeof p.url_pdf === 'string' && p.url_pdf.includes('arxiv.org'), 'url_pdf valid');
    assert(Array.isArray(p.tags) && p.tags.length > 0, 'tags non-empty');
    console.log(`   tldr: ${(p.tldr_1 || '').slice(0, 90)}`);
    console.log(`   why[0]: ${(p.why_recommended[0] || '').slice(0, 90)}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Some checks failed. See above for details.');
    process.exit(1);
  } else {
    console.log('All checks passed ✓');
  }
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
