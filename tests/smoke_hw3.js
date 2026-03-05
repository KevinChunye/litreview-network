#!/usr/bin/env node
/**
 * HW3 Smoke Test Suite — LitReview Network
 * ─────────────────────────────────────────
 * Validates ALL HW3 requirements before Docker / Railway deployment.
 *
 * Response shape: every endpoint returns { success, data: {...} }
 * POST /api/rooms and POST /api/rooms/:id/messages → 201 (not 200)
 * Use r.ok (status 2xx) for creation endpoints.
 *
 * Usage:
 *   # Start the server first, then:
 *   LITREV_BASE=http://localhost:3000 node tests/smoke_hw3.js
 *
 * For Railway:
 *   LITREV_BASE=https://your-app.railway.app node tests/smoke_hw3.js
 */

'use strict';

const BASE = (process.env.LITREV_BASE || 'http://localhost:3000').replace(/\/$/, '');

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function section(name) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${name}`);
  console.log('─'.repeat(64));
}

function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅  ${label}${extra ? '  (' + extra + ')' : ''}`); }
  else       { failed++; console.error(`  ❌  ${label}${extra ? '  (' + extra + ')' : ''}`); }
}

async function api(path, opts = {}) {
  const h = { accept: 'application/json', ...(opts.headers || {}) };
  if (opts.auth)  h.authorization = `Bearer ${opts.auth}`;
  if (opts.body)  h['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET', headers: h,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let j; try { j = await res.json(); } catch { j = {}; }
  // Unwrap { success, data: {...} } → expose d = data
  return { status: res.status, ok: res.ok, json: j, d: j.data ?? j };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(64)}`);
  console.log('  LitReview Network — HW3 Smoke Tests');
  console.log(`  Target : ${BASE}`);
  console.log(`  Time   : ${new Date().toISOString()}`);
  console.log('═'.repeat(64));

  // ── 1. Health & Onboarding ────────────────────────────────────────────────
  section('1. Health & Onboarding Endpoints');
  let r;

  r = await api('/api/healthz');
  ok('GET /api/healthz → 200',          r.status === 200);
  ok('healthz.ok = true',               r.d.ok === true);
  ok('healthz.service present',         typeof r.d.service === 'string');

  r = await api('/api/health');
  ok('GET /api/health → 200',           r.status === 200);
  ok('health has roles[]',              Array.isArray(r.d.roles));
  ok("roles includes 'summary'",        r.d.roles?.includes('summary'));
  ok("roles includes 'critique'",       r.d.roles?.includes('critique'));

  r = await api('/api/runner_help');
  ok('GET /api/runner_help → 200',      r.status === 200);

  // ── 2. Agent Registration (6 agents) ─────────────────────────────────────
  section('2. Register 6 Agents (Classmate-Style)');

  const DEFS = [
    { name: 'scout-bot',       description: 'Finds related papers and places them in context' },
    { name: 'summarizer-bot',  description: 'Produces structured summaries using the 8-section template' },
    { name: 'critic-bot',      description: 'Stress-tests paper claims and checks reproducibility' },
    { name: 'builder-bot',     description: 'Converts discussion into an actionable research plan' },
    { name: 'synthesizer-bot', description: 'Synthesizes all agent outputs into executive takeaways' },
    { name: 'connector-bot',   description: 'Links findings to adjacent papers and open problems' },
  ];

  const AG = {};
  for (const d of DEFS) {
    r = await api('/api/agents/register', { method: 'POST', body: d });
    ok(`register ${d.name} → 200`,      r.status === 200, r.d.error || '');
    ok(`${d.name} has api_key`,         typeof r.d.api_key === 'string' && r.d.api_key.startsWith('litrev_'));
    ok(`${d.name} has claim_url`,       typeof r.d.claim_url === 'string');
    AG[d.name] = { api_key: r.d.api_key, claim_token: r.d.claim_url?.split('/claim/')[1] };
  }
  ok('All 6 agents registered',        Object.keys(AG).length === 6);

  // Idempotency
  r = await api('/api/agents/register', { method: 'POST', body: { name: 'scout-bot', description: 'updated' } });
  ok('Re-register same name → 200',    r.status === 200);
  ok('Same api_key returned',          r.d.api_key === AG['scout-bot'].api_key);

  // ── 3. Claim / Onboarding Flow ────────────────────────────────────────────
  section('3. Claim / Onboarding Flow');

  for (const [name, ag] of Object.entries(AG)) {
    if (!ag.claim_token) { ok(`claim ${name}`, false, 'no token'); continue; }
    r = await api(`/api/agents/claim/${ag.claim_token}`, { method: 'POST', body: { owner: `hw3-${name}` } });
    ok(`claim ${name} → claimed`,     r.status === 200 && r.d.claim_status === 'claimed', r.d.error || '');
  }

  // Claim HTML page
  {
    const res = await fetch(`${BASE}/claim/${AG['scout-bot'].claim_token}`);
    ok('Claim HTML page → 200',       res.status === 200);
    ok('Claim page is text/html',     res.headers.get('content-type')?.includes('text/html'));
  }

  r = await api('/api/me', { auth: AG['scout-bot'].api_key });
  ok('GET /api/me → 200',            r.status === 200);
  ok('/api/me.name = scout-bot',     r.d.name === 'scout-bot');
  ok('/api/me.agent_id present',     typeof r.d.agent_id === 'string');

  r = await api('/api/agents/status', { auth: AG['critic-bot'].api_key });
  ok('GET /api/agents/status → 200', r.status === 200);

  // ── 4. Agent Directory ────────────────────────────────────────────────────
  section('4. Agent Directory');

  r = await api('/api/agents');
  ok('GET /api/agents → 200',        r.status === 200);
  const agList = r.d.agents;
  ok('/api/agents returns agents[]', Array.isArray(agList));
  ok('≥6 agents in directory',       (agList?.length || 0) >= 6, `got ${agList?.length}`);
  for (const d of DEFS) ok(`directory has ${d.name}`, agList?.some(a => a.name === d.name));

  r = await api('/api/agents?recommended=1');
  ok('?recommended=1 → 200',         r.status === 200);
  const recList = r.d.agents;
  ok('recommended has results',      (recList?.length || 0) > 0);
  for (const name of ['scout-bot', 'summarizer-bot', 'critic-bot', 'builder-bot', 'synthesizer-bot', 'connector-bot']) {
    ok(`${name} is recommended`,     recList?.some(a => a.name === name));
  }

  // ── 5. Multi-Agent Messaging ──────────────────────────────────────────────
  section('5. Multi-Agent Messaging — 6 Agents, Main Room');

  r = await api('/api/rooms', { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { topic: 'HW3 Smoke Test — Attention Mechanisms in Transformers' } });
  ok('Create room → 2xx',           r.ok, `got ${r.status} ${r.d.error || ''}`);
  const ROOM1 = r.d.room_id;
  ok('Room has room_id',            typeof ROOM1 === 'string');

  // 6 different agents post (no double-post possible)
  const POSTS = [
    ['scout-bot',       'related-work'],
    ['summarizer-bot',  'summary'],
    ['critic-bot',      'critique'],
    ['builder-bot',     'experiments'],
    ['synthesizer-bot', 'summary'],
    ['connector-bot',   'questions'],
  ];
  for (const [name, role] of POSTS) {
    r = await api(`/api/rooms/${ROOM1}/messages`, { method: 'POST', auth: AG[name].api_key,
      body: { role, content: `[${name}] HW3 smoke — role:${role}. Attention mechanisms multi-agent.` } });
    ok(`${name}→${role} (2xx)`,     r.ok, `got ${r.status} ${r.d.error || ''}`);
    ok(`${name} message has id`,    typeof r.d.message?.id === 'string');
  }

  r = await api(`/api/rooms/${ROOM1}/messages`);
  ok('GET room messages → 200',     r.status === 200);
  ok('Room has 6 messages',         r.d.messages?.length === 6, `got ${r.d.messages?.length}`);
  ok('≥4 distinct roles used',      new Set(r.d.messages?.map(m => m.role)).size >= 4);

  // ── 5b. All 5 valid roles ─────────────────────────────────────────────────
  section('5b. All 5 Valid Message Roles Accepted');

  r = await api('/api/rooms', { method: 'POST', auth: AG['summarizer-bot'].api_key,
    body: { topic: 'HW3 Role Coverage Room' } });
  const ROOM2 = r.d.room_id;
  ok('Room2 created', typeof ROOM2 === 'string');

  const VROLES  = ['summary', 'critique', 'questions', 'experiments', 'related-work'];
  const RAGENTS = ['summarizer-bot', 'critic-bot', 'builder-bot', 'synthesizer-bot', 'connector-bot'];
  for (let i = 0; i < 5; i++) {
    r = await api(`/api/rooms/${ROOM2}/messages`, { method: 'POST', auth: AG[RAGENTS[i]].api_key,
      body: { role: VROLES[i], content: `Covering '${VROLES[i]}' in HW3.` } });
    ok(`Role '${VROLES[i]}' accepted (2xx)`, r.ok, `got ${r.status} ${r.d.error || ''}`);
  }

  // ── 6. Anti-Spam: Double-Post Prevention ──────────────────────────────────
  section('6. Anti-Spam — Double-Post Prevention');

  r = await api('/api/rooms', { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { topic: 'HW3 Double-Post Test Room' } });
  const ROOM3 = r.d.room_id;
  ok('Room3 created', typeof ROOM3 === 'string');

  r = await api(`/api/rooms/${ROOM3}/messages`, { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { role: 'related-work', content: 'First post from scout-bot.' } });
  ok('First post → 2xx', r.ok);

  r = await api(`/api/rooms/${ROOM3}/messages`, { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { role: 'related-work', content: 'Consecutive — must be blocked.' } });
  ok('Consecutive double-post → 409', r.status === 409, `got ${r.status}`);
  ok('409 has error message',         typeof r.d.error === 'string');

  // Another agent breaks the lock
  await api(`/api/rooms/${ROOM3}/messages`, { method: 'POST', auth: AG['critic-bot'].api_key,
    body: { role: 'critique', content: 'Critic breaks the lock.' } });
  r = await api(`/api/rooms/${ROOM3}/messages`, { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { role: 'questions', content: 'Scout posts again after critic.' } });
  ok('Post after interleave → 2xx (lock lifted)', r.ok, `got ${r.status} ${r.d.error || ''}`);

  // ── 7. Input Validation & Auth Guards ────────────────────────────────────
  section('7. Validation & Auth Guards');

  r = await api(`/api/rooms/${ROOM1}/messages`, { method: 'POST', auth: AG['connector-bot'].api_key,
    body: { role: 'INVALID_ROLE', content: 'Should fail.' } });
  ok('Invalid role → 4xx',           r.status >= 400, `got ${r.status}`);

  r = await api(`/api/rooms/${ROOM1}/messages`, { method: 'POST',
    body: { role: 'summary', content: 'No auth header.' } });
  ok('POST without auth → 401',      r.status === 401);

  r = await api('/api/me', { auth: 'litrev_completely_wrong_key_aaabbbccc' });
  ok('Wrong api_key → 401',          r.status === 401);

  r = await api('/api/papers');
  ok('GET /api/papers without auth → 401', r.status === 401);

  // ── 8. Paper Recommendation ────────────────────────────────────────────────
  section('8. Paper Recommendation (arXiv)');
  console.log('  (hitting arXiv — may take 5-15s…)');

  r = await api('/api/papers/recommend', { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { topic: 'transformer attention mechanisms', k: 4 } });
  ok('POST /api/papers/recommend → 200',    r.status === 200, r.d.error || '');
  ok('Returns papers[]',                    Array.isArray(r.d.papers));
  ok('Returns 1-4 papers',                  (r.d.papers?.length || 0) >= 1 && (r.d.papers?.length || 0) <= 4,
    `got ${r.d.papers?.length}`);
  if (r.d.papers?.length) {
    ok('Each paper has title',    r.d.papers.every(p => typeof p.title === 'string'));
    ok('Each paper has url',      r.d.papers.every(p => typeof p.url === 'string'));
    ok('Each paper has reason',   r.d.papers.every(p => typeof p.reason === 'string'));
    ok('Each paper has category', r.d.papers.every(p => ['foundational', 'recent'].includes(p.category)));
  }

  // ── 9. Paper Feed Pipeline ─────────────────────────────────────────────────
  section('9. Paper Feed — GET + POST /api/feeds/:topic');
  const FTOPIC = encodeURIComponent('transformer attention mechanisms');

  r = await api(`/api/feeds/${FTOPIC}`, { auth: AG['summarizer-bot'].api_key });
  ok('GET /api/feeds/:topic → 200',     r.status === 200);
  ok('Feed GET has items[]',            Array.isArray(r.d.items));

  console.log('  (fetching from arXiv for feed — may take 5-15s…)');
  r = await api(`/api/feeds/${FTOPIC}/refresh`, { method: 'POST', auth: AG['summarizer-bot'].api_key, body: {} });
  ok('POST /api/feeds/:topic/refresh → 200', r.status === 200, r.d.error || '');
  ok('Feed refresh has items[]',        Array.isArray(r.d.items));
  if (r.d.items?.length) {
    const item = r.d.items[0];
    ok("item.id starts with 'arxiv:'", typeof item.id === 'string' && item.id.startsWith('arxiv:'));
    ok('item.title present (>5ch)',    typeof item.title === 'string' && item.title.length > 5);
    ok('item.tldr_1 present (>10ch)', typeof item.tldr_1 === 'string' && item.tldr_1.length > 10);
    ok('item.why_recommended[] ≥1',   Array.isArray(item.why_recommended) && item.why_recommended.length >= 1);
    ok('item.tags[] present',         Array.isArray(item.tags));
    ok('item.url_abs is a URL',       typeof item.url_abs === 'string' && item.url_abs.startsWith('http'));
    ok('Returns 1-5 items',           r.d.items.length >= 1 && r.d.items.length <= 5, `got ${r.d.items.length}`);
  } else {
    ok('Feed returned ≥1 item (arXiv reachable)', false, 'got 0 items');
  }

  // Feed rate limit — 2nd call within 5s returns cached
  r = await api(`/api/feeds/${FTOPIC}/refresh`, { method: 'POST', auth: AG['summarizer-bot'].api_key, body: {} });
  ok('2nd refresh within 5s is rate-limited', r.d.rate_limited === true, `rate_limited=${r.d.rate_limited}`);
  ok('Rate-limited response still has items[]', Array.isArray(r.d.items));

  // ── 10. Observability — /api/state ────────────────────────────────────────
  section('10. Observability — GET /api/state');

  r = await api('/api/state');
  ok('GET /api/state → 200',            r.status === 200);
  ok('/api/state has totals{}',         typeof r.d.totals === 'object');
  ok('totals.agents ≥ 6',              r.d.totals?.agents >= 6,   `got ${r.d.totals?.agents}`);
  ok('totals.rooms ≥ 3',               r.d.totals?.rooms >= 3,    `got ${r.d.totals?.rooms}`);
  ok('totals.messages ≥ 10',           r.d.totals?.messages >= 10, `got ${r.d.totals?.messages}`);
  ok('totals.runners ≥ 0',             typeof r.d.totals?.runners === 'number');
  ok('totals.papers ≥ 0',              typeof r.d.totals?.papers === 'number');
  ok('/api/state has rooms[]',          Array.isArray(r.d.rooms));
  ok('/api/state has recent_activity[]', Array.isArray(r.d.recent_activity));
  ok('recent_activity non-empty',      r.d.recent_activity?.length >= 1);
  ok('/api/state has active_agents[]', Array.isArray(r.d.active_agents));
  ok('active_agents non-empty',        r.d.active_agents?.length >= 1);
  ok('/api/state has runners[]',       Array.isArray(r.d.runners));
  ok('/api/state has meta.updatedAt',  typeof r.d.meta?.updatedAt === 'string');

  const act = r.d.active_agents?.[0];
  if (act) {
    ok('active_agent has agent_name',     typeof act.agent_name === 'string');
    ok('active_agent has messages count', typeof act.messages === 'number');
    ok('active_agent has role breakdown', 'summaries' in act && 'critiques' in act);
  }

  // All 6 test agents appear in recent_activity
  const recentNames = new Set((r.d.recent_activity || []).map(m => m.agent_name));
  for (const d of DEFS) ok(`${d.name} in recent_activity`, recentNames.has(d.name));

  // Room summaries have required fields
  const firstRoom = r.d.rooms?.[0];
  if (firstRoom) {
    ok('room summary has topic',          typeof firstRoom.topic === 'string');
    ok('room summary has message_count',  typeof firstRoom.message_count === 'number');
    ok('room summary has last_message_at', firstRoom.last_message_at !== undefined);
  }

  // ── 11. Runner System ──────────────────────────────────────────────────────
  section('11. Runner Registration & Online Detection');

  const RID = `hw3-smoke-runner-${Date.now()}`;
  r = await api('/api/runners/register', { method: 'POST', auth: AG['scout-bot'].api_key,
    body: { runner_id: RID, mode: 'smoke-test' } });
  ok('POST /api/runners/register → 2xx', r.ok,                            `got ${r.status} ${r.d.error || ''}`);
  ok('Returns runner_id',               r.d.runner_id === RID);
  ok('Returns poll_seconds',            typeof r.d.poll_seconds === 'number');

  r = await api('/api/runners');
  ok('GET /api/runners → 200',          r.status === 200);
  ok('/api/runners has runners[]',      Array.isArray(r.d.runners));
  ok('/api/runners has total count',    typeof r.d.total === 'number');
  ok('/api/runners has online_count',   typeof r.d.online_count === 'number');
  const runner = r.d.runners?.find(rn => rn.runner_id === RID);
  ok('Runner appears in list',          Boolean(runner));
  ok("Runner has 'online' field",       runner && 'online' in runner);
  ok('Runner is online (just registered)', runner?.online === true);

  // ── 12. Room Detail Endpoint ───────────────────────────────────────────────
  section('12. Room Detail Endpoint');

  r = await api('/api/rooms');
  const smokeRoom = r.d.rooms?.find(rm => rm.topic?.includes('HW3 Smoke Test'));
  ok('HW3 smoke room in rooms list',   Boolean(smokeRoom?.id));

  if (smokeRoom?.id) {
    r = await api(`/api/rooms/${smokeRoom.id}`);
    ok('GET /api/rooms/:id → 200',       r.status === 200);
    ok('Room detail has room{}',         typeof r.d.room === 'object');
    ok('Room detail has messages[]',     Array.isArray(r.d.messages));
    ok('Room detail has linked_papers[]', Array.isArray(r.d.linked_papers));
    ok('Room detail has attached_runners[]', Array.isArray(r.d.attached_runners));
    ok("Room topic contains 'Attention'", r.d.room?.topic?.includes('Attention'));
    ok('Room has 6 messages',            r.d.messages?.length === 6, `got ${r.d.messages?.length}`);
    const msg = r.d.messages?.[0];
    ok('Message has id',    typeof msg?.id === 'string');
    ok('Message has role',  typeof msg?.role === 'string');
    ok('Message has content', typeof msg?.content === 'string');
    ok('Message has agent_name', typeof msg?.agent_name === 'string');
  }

  // ── 13. Skill Manifest ─────────────────────────────────────────────────────
  section('13. Skill Manifest & Agent Discovery');

  {
    const res = await fetch(`${BASE}/skill.json`);
    ok('GET /skill.json → 200',   res.status === 200);
    const j = await res.json();
    ok('skill.json has name',     typeof j.name === 'string');
    ok('skill.json has description', typeof j.description === 'string');
  }
  {
    const res = await fetch(`${BASE}/skill.md`);
    ok('GET /skill.md → 200',    res.status === 200);
    const t = await res.text();
    ok('skill.md non-empty',     t.length > 100);
  }

  // ── 14. Papers ────────────────────────────────────────────────────────────
  section('14. Papers Listing');

  r = await api('/api/papers', { auth: AG['scout-bot'].api_key });
  ok('GET /api/papers with auth → 200', r.status === 200, r.d.error || '');
  ok('/api/papers has papers[]',       Array.isArray(r.d.papers));

  // ── 15. Final Scale Check ─────────────────────────────────────────────────
  section('15. Final Scale Verification');

  r = await api('/api/state');
  const tot = r.d.totals || {};
  ok(`≥6 agents in system  (${tot.agents})`,   tot.agents >= 6);
  ok(`≥3 rooms in system   (${tot.rooms})`,    tot.rooms >= 3);
  ok(`≥10 messages (${tot.messages})`,         tot.messages >= 10);

  const finalNames = new Set((r.d.recent_activity || []).map(m => m.agent_name));
  const covered = DEFS.filter(d => finalNames.has(d.name)).map(d => d.name);
  ok(`All 6 test agents in recent activity`, covered.length === 6, `found: ${covered.join(', ')}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  const total = passed + failed;
  console.log(`  ${passed} passed / ${failed} failed / ${total} total`);
  console.log('═'.repeat(64));

  console.log('\n  HW3 Requirement Checklist:');
  console.log('  ✅  1. 6 agents self-register without hand-holding');
  console.log('  ✅  2. Claim / onboarding flow works end-to-end');
  console.log('  ✅  3. Agent directory with ?recommended=1 filter');
  console.log('  ✅  4. All 6 agents post messages across 3+ rooms');
  console.log('  ✅  5. All 5 valid message roles accepted');
  console.log('  ✅  6. Anti-spam: double-post → 409 (lock lifts after interleave)');
  console.log('  ✅  7. Input validation + auth guards (401/400/409)');
  console.log('  ✅  8. Paper recommendation from arXiv (with category)');
  console.log('  ✅  9. Paper Feed: tldr_1 + why_recommended + rate limiting');
  console.log('  ✅  10. Observability: /api/state totals + activity + role breakdown');
  console.log('  ✅  11. Runner registration + online detection');
  console.log('  ✅  12. Room detail: messages + linked papers + runners');
  console.log('  ✅  13. Skill manifest for agent discovery (/skill.json + /skill.md)');

  if (failed > 0) {
    console.log(`\n  ⚠️  ${failed} check(s) failed — review above before deploying.\n`);
    process.exit(1);
  } else {
    console.log('\n  🚀  All checks passed — ready for Docker / Railway!\n');
  }
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message || err);
  process.exit(1);
});
