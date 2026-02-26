#!/usr/bin/env node
'use strict';

const { normalizeMessagePayload } = require('./lib/normalize_message_payload');

const BASE = String(process.env.BASE || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const ROOM_ID = String(process.env.ROOM_ID || '').trim();
const LITREV_API_KEY = String(process.env.LITREV_API_KEY || '').trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const DEMO_MODE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.DEMO_MODE || '').trim().toLowerCase(),
);
const USE_MOCK_OPENAI = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MOCK_OPENAI || '').trim().toLowerCase(),
);
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim();
const DEFAULT_POLL_SECONDS = DEMO_MODE ? 1 : 10;
const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = DEMO_MODE ? 3 : 20;
const POLL_SECONDS = Math.max(1, Number(process.env.POLL_SECONDS || DEFAULT_POLL_SECONDS));
const MODE_RAW = String(process.env.MODE || 'critic').trim().toLowerCase();
const ENABLE_WEB_SEARCH = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.OPENAI_ENABLE_WEB_SEARCH || '').trim().toLowerCase(),
);
const AUTO_INGEST_URLS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.AUTO_INGEST_URLS || '').trim().toLowerCase(),
);
const RESPOND_FILTER = String(process.env.RESPOND_FILTER || 'question_or_role').trim().toLowerCase();
const MAX_RETRIES = Math.max(0, Number(process.env.OPENAI_MAX_RETRIES || 4));
const MIN_SECONDS_BETWEEN_POSTS = Math.max(
  0,
  Number(process.env.MIN_SECONDS_BETWEEN_POSTS || DEFAULT_MIN_SECONDS_BETWEEN_POSTS),
);
const MODE_ALIASES = {
  scout: 'scout',
  retriever: 'scout',
  fetch: 'scout',
  researcher: 'scout',
  related: 'scout',
  'related-work': 'scout',
  relatedwork: 'scout',
  summarizer: 'summarizer',
  summary: 'summarizer',
  sum: 'summarizer',
  critic: 'critic',
  critique: 'critic',
  reviewer: 'critic',
  builder: 'builder',
  experimenter: 'builder',
  experiments: 'builder',
  implementer: 'builder',
};
const MODE = MODE_ALIASES[MODE_RAW] || 'critic';

if (!ROOM_ID || !LITREV_API_KEY || (!OPENAI_API_KEY && !USE_MOCK_OPENAI)) {
  console.error('Missing required env vars.');
  console.error('Required: ROOM_ID, LITREV_API_KEY, and OPENAI_API_KEY (or set MOCK_OPENAI=1)');
  console.error('Example: BASE=http://127.0.0.1:3000 OPENAI_API_KEY=... LITREV_API_KEY=... ROOM_ID=... MODE=critic node scripts/agent_runner.js');
  process.exit(1);
}

const triggerRolesByMode = {
  scout: new Set(['questions']),
  summarizer: new Set(['critique', 'related-work', 'questions', 'experiments']),
  critic: new Set(['summary', 'questions']),
  builder: new Set(['summary', 'critique', 'related-work', 'questions']),
};

const state = {
  selfAgentId: '',
  selfName: '',
  lastSeenMessageId: String(process.env.LAST_SEEN_MESSAGE_ID || '').trim(),
  startedFromEmptyRoom: false,
  lastPostedAtMs: 0,
  recentlyIngestedUrls: new Set(),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function trunc(value, n = 600) {
  const text = String(value || '').trim();
  return text.length > n ? `${text.slice(0, n)}...` : text;
}

async function litrevRequest(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${LITREV_API_KEY}`,
  };

  let body;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RUNNER_HTTP_TIMEOUT_MS || 15000));

  try {
    const res = await fetch(`${BASE}${path}`, {
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
        throw new Error(`Invalid JSON from ${path}: ${raw.slice(0, 240)}`);
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

function extractResponseText(data) {
  if (data && typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  const outputs = Array.isArray(data && data.output) ? data.output : [];
  for (const outputItem of outputs) {
    const content = Array.isArray(outputItem && outputItem.content) ? outputItem.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text) chunks.push(part.text);
      if (typeof part?.output_text === 'string' && part.output_text) chunks.push(part.output_text);
    }
  }

  return chunks.join('\n').trim();
}

function parseJsonObjectFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    // Try to extract first JSON object block.
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  }

  return null;
}

function summaryTemplate() {
  return [
    '## TL;DR',
    '(3 sentences max)',
    '',
    '## Problem',
    '(what gap)',
    '',
    '## Method',
    '- Setting/data:',
    '- Model/algorithm:',
    '- Baselines:',
    '- Eval metric:',
    '',
    '## Results',
    '- Include >=1 number if present in snippets with [Snippet x].',
    '- Else write exactly: No numeric results in snippets [Snippet x,y].',
    '',
    '## Limitations',
    '- ',
    '- ',
    '',
    '## Open questions',
    '- ',
  ].join('\n');
}

function critiqueTemplate() {
  return [
    '## Positioning / related work',
    '- Compare against at least one other ingested paper when available.',
    '',
    '## Strengths',
    '- ',
    '',
    '## Weaknesses',
    '- ',
    '',
    '## Key confounds',
    '- ',
    '',
    '## Suggested ablations',
    '- Ablation 1: expected outcome -> interpretation',
    '- Ablation 2: expected outcome -> interpretation',
    '',
    '## What would change my mind',
    '- ',
    '',
    '## Practitioner takeaway',
    '- ',
  ].join('\n');
}

function scoutTemplate() {
  return [
    '## Recent paper scan',
    '- List 3-6 candidate papers with title, year, and why relevant.',
    '',
    '## Top recommendations',
    '- Recommend top 1-2 papers to focus on next.',
    '',
    '## Why these are timely',
    '- Explain recency and significance briefly.',
    '',
    '## If browsing unavailable',
    '- Say explicitly that web search is disabled and provide a standard reading list fallback.',
    '',
    '## Next handoff',
    '- Tell summarizer which 1-2 papers/URLs to summarize first.',
  ].join('\n');
}

function builderTemplate() {
  return [
    '## Proposed experiments',
    '- Experiment 1: setup, metric, expected outcome.',
    '- Experiment 2: setup, metric, expected outcome.',
    '',
    '## Applications',
    '- One practical application for short-term prototype.',
    '- One longer-term application.',
    '',
    '## Build-next plan',
    '- Concrete implementation steps to add in this repo next.',
    '',
    '## Risks and mitigations',
    '- Main risk and how to reduce it.',
  ].join('\n');
}

function buildSystemPrompt() {
  let roleName = 'Critic agent';
  let sectionRules =
    'Use headings exactly: Positioning / related work, Strengths, Weaknesses, Key confounds, Suggested ablations, What would change my mind, Practitioner takeaway.';
  let roleDirective = '';
  if (MODE === 'scout') {
    roleName = 'Scout agent';
    sectionRules =
      'Use headings exactly: Recent paper scan, Top recommendations, Why these are timely, If browsing unavailable, Next handoff.';
    roleDirective = ENABLE_WEB_SEARCH
      ? 'When user asks for latest/recent/state-of-the-art updates, use web search to identify recent papers and include title + year.'
      : "Web search is disabled; explicitly state that and provide a standard fallback reading list without failing.";
  } else if (MODE === 'summarizer') {
    roleName = 'Summarizer agent';
    sectionRules = 'Use headings exactly: TL;DR, Problem, Method, Results, Limitations, Open questions.';
    roleDirective = 'Summarize the top recommended paper(s) or ingested URL content with grounded claims.';
  } else if (MODE === 'builder') {
    roleName = 'Builder agent';
    sectionRules =
      'Use headings exactly: Proposed experiments, Applications, Build-next plan, Risks and mitigations.';
    roleDirective = 'Propose concrete next experiments and implementation steps for this repository.';
  } else if (MODE === 'critic') {
    roleDirective = 'Identify confounds, missing baselines, and at least one ablation to test the claim.';
  }

  return [
    `You are a ${roleName} in LitReview Network.`,
    'Return strict JSON only: {"content":"...","question":"..."}.',
    sectionRules,
    roleDirective,
    'Grounding rule: if snippets are present and you claim X, cite a snippet index like [Snippet 2].',
    'Do not invent quantitative numbers; if none are available, explicitly say no numeric results in snippets.',
    'If external web evidence is not available, explicitly say so.',
    'Keep under 1200 characters and end with one sharp next question.',
  ].join(' ');
}

function buildUserPrompt(context) {
  const template =
    MODE === 'scout'
      ? scoutTemplate()
      : MODE === 'summarizer'
      ? summaryTemplate()
      : MODE === 'builder'
        ? builderTemplate()
        : critiqueTemplate();
  return [
    `Mode: ${MODE}`,
    `Web search enabled: ${ENABLE_WEB_SEARCH ? 'yes' : 'no'}`,
    'Last message (you are replying to this):',
    context.lastMessage,
    '',
    'Recent thread context (oldest->newest):',
    context.thread,
    '',
    'Papers in system (for related-work citation rule):',
    context.papers,
    '',
    `Carry citation forward if available: ${context.carryCitation || '(none)'}`,
    '',
    'Template to follow:',
    template,
    '',
    'Output JSON only with keys: content, question.',
  ].join('\n');
}

function buildMockModelOutput(lastMessage, papers) {
  const fallbackQuestion = 'Which single follow-up would most reduce uncertainty in your claim?';
  const carryCitation = String(lastMessage.citation || '').trim();
  const firstPaper = Array.isArray(papers) && papers.length ? papers[0] : null;
  const defaultCitation = firstPaper && firstPaper.paper_id ? `paper:${firstPaper.paper_id} snippets:1` : '';

  if (MODE === 'scout') {
    const browseLine = ENABLE_WEB_SEARCH
      ? '- Mock mode: web search would normally run here for recent paper discovery.'
      : '- Web search disabled: using fallback reading list style recommendations.';
    return {
      content: [
        '## Recent paper scan',
        '- Candidate A (2025): long-horizon planning with retrieval-augmented world models; relevant for sparse rewards.',
        '- Candidate B (2024): hierarchical RL planning with latent skills; relevant for long-horizon decomposition.',
        '- Candidate C (2023): tool-using policy agents for planning; relevant for external knowledge grounding.',
        '',
        '## Top recommendations',
        '- Focus 1: Candidate A for strongest recency and planning benchmarks.',
        '- Focus 2: Candidate B for strong ablation coverage.',
        '',
        '## Why these are timely',
        '- They directly target long-horizon credit assignment and planning under uncertainty.',
        '',
        '## If browsing unavailable',
        browseLine,
        '',
        '## Next handoff',
        '- Summarizer should extract methods + claims from Candidate A and B first.',
      ].join('\n'),
      question: 'Summarizer: can you extract method details and the strongest quantitative claim for the top 2 picks?',
      citation: carryCitation || defaultCitation,
    };
  }

  if (MODE === 'summarizer') {
    return {
      content: [
        '## TL;DR',
        'The thread argues for a practical method with promising gains, but evidence granularity is still limited.',
        '',
        '## Problem',
        'Gap: we need clearer attribution of where gains come from and where failures occur.',
        '',
        '## Method',
        '- Setting/data: inferred from room context',
        '- Model/algorithm: inferred from cited paper snippets',
        '- Baselines: mentioned in prior thread only',
        '- Eval metric: not fully specified',
        '',
        '## Results',
        '- No numeric results in snippets [Snippet 1,2]',
        '',
        '## Limitations',
        '- Unclear error taxonomy across tool/reasoning components',
        '- Potential prompt sensitivity',
        '',
        '## Open questions',
        '- Which ablation isolates tool-selection failures from reasoning failures?',
      ].join('\n'),
      question: fallbackQuestion,
      citation: carryCitation || defaultCitation,
    };
  }

  if (MODE === 'builder') {
    return {
      content: [
        '## Proposed experiments',
        '- Experiment 1: long-horizon benchmark with noisy tools ON/OFF; metric: success@horizon; expected: robust agents degrade less.',
        '- Experiment 2: planner depth ablation with fixed retrieval; metric: cumulative reward and variance; expected: deeper planning helps until error compounding.',
        '',
        '## Applications',
        '- Short-term: decision-support assistant for multi-step operations planning.',
        '- Long-term: autonomous research planner over evolving literature.',
        '',
        '## Build-next plan',
        '- Add eval harness endpoints for ablation configs.',
        '- Add structured metrics table in room UI.',
        '- Add result export JSON for reproducible comparisons.',
        '',
        '## Risks and mitigations',
        '- Risk: benchmark overfitting. Mitigation: include out-of-distribution task split.',
      ].join('\n'),
      question: fallbackQuestion,
      citation: carryCitation || defaultCitation,
    };
  }

  return {
    content: [
      '## Positioning / related work',
      '- Position is plausible but under-specified relative to close baselines.',
      '',
      '## Strengths',
      '- Thread has a coherent mechanism hypothesis.',
      '',
      '## Weaknesses',
      '- Evidence does not yet isolate causal factors.',
      '',
      '## Key confounds',
      '- Prompt tuning and tool quality may be entangled.',
      '',
      '## Suggested ablations',
      '- Ablation 1: remove tool calls, keep prompt fixed -> if performance drops, tool access matters.',
      '- Ablation 2: perturb prompt with tools enabled -> if variance spikes, prompt sensitivity dominates.',
      '',
      '## What would change my mind',
      '- Stable improvements across seeds and noisy-tool settings.',
      '',
      '## Practitioner takeaway',
      '- Promising direction, but treat claims as preliminary pending stronger controls.',
    ].join('\n'),
    question: fallbackQuestion,
    citation: carryCitation || defaultCitation,
  };
}

async function callOpenAIWithRetry(systemPrompt, userPrompt) {
  let attempt = 0;
  let allowWebSearch = ENABLE_WEB_SEARCH;
  while (true) {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestBody = {
        model: OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userPrompt }],
          },
        ],
        temperature: 0.3,
        max_output_tokens: 1000,
      };
      if (allowWebSearch) {
        requestBody.tools = [{ type: 'web_search_preview' }];
      }

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        const err = new Error(`OpenAI JSON parse failed: ${raw.slice(0, 240)}`);
        err.status = res.status;
        throw err;
      }

      if (!res.ok) {
        const message = (data && data.error && data.error.message) || `OpenAI error ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        err.code = data && data.error && data.error.code ? data.error.code : '';
        throw err;
      }

      return data;
    } catch (err) {
      const msg = String(err.message || '').toLowerCase();
      const unsupportedWebSearch =
        allowWebSearch &&
        Number(err.status) === 400 &&
        (msg.includes('web_search') ||
          msg.includes('tool') ||
          String(err.code || '').toLowerCase().includes('tool'));
      if (unsupportedWebSearch) {
        allowWebSearch = false;
        console.warn(`[${nowIso()}] web_search tool unsupported; retrying without it.`);
        await sleep(250);
        continue;
      }

      const isRetriable = Number(err.status) === 429;
      if (!isRetriable || attempt >= MAX_RETRIES) {
        throw err;
      }
      const backoffMs = Math.min(20000, Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500));
      console.warn(`[${nowIso()}] OpenAI 429 retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`);
      await sleep(backoffMs);
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractUrls(text) {
  const source = String(text || '');
  const matches = source.match(/\bhttps?:\/\/[^\s<>"')]+/gi) || [];
  const unique = [];
  for (const url of matches) {
    if (!unique.includes(url)) unique.push(url);
  }
  return unique.slice(0, 5);
}

async function maybeIngestFromMessage(lastMessage, papers) {
  if (!AUTO_INGEST_URLS) return papers;
  const combined = `${lastMessage.content || ''}\n${lastMessage.question || ''}\n${lastMessage.citation || ''}`;
  const urls = extractUrls(combined);
  if (!urls.length) return papers;

  const knownUrls = new Set((Array.isArray(papers) ? papers : []).map((p) => String(p.url || '').trim()));
  const out = Array.isArray(papers) ? [...papers] : [];

  for (const url of urls) {
    if (knownUrls.has(url) || state.recentlyIngestedUrls.has(url)) continue;
    try {
      const ingested = await litrevRequest('/api/papers/ingest', {
        method: 'POST',
        body: { url },
      });
      const paperId = String((ingested && ingested.paper_id) || '').trim();
      if (paperId) {
        state.recentlyIngestedUrls.add(url);
        knownUrls.add(url);
        out.push({
          paper_id: paperId,
          title: ingested.title || '',
          url,
        });
        console.log(`[${nowIso()}] auto-ingested referenced URL: ${url}`);
      }
    } catch (err) {
      console.warn(`[${nowIso()}] auto-ingest skipped (${url}): ${err.message}`);
    }
  }

  return out;
}

function textHasLatestIntent(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  return /(latest|most recent|recent updates|recent papers|state of the art|sota|new papers|this year|last year)/i.test(
    value,
  );
}

function findLatestIntentMessageIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const combined = `${message.content || ''}\n${message.question || ''}`;
    if (textHasLatestIntent(combined)) {
      return i;
    }
  }
  return -1;
}

function hasScoutReplyAfter(messages, index) {
  if (index < 0) return false;
  for (let i = index + 1; i < messages.length; i += 1) {
    const role = String(messages[i].role || '').toLowerCase();
    if (role === 'related-work') return true;
  }
  return false;
}

function shouldRespond(lastMessage) {
  if (!lastMessage) return false;

  if (RESPOND_FILTER === 'none' || RESPOND_FILTER === 'always') {
    return true;
  }

  const hasQuestion = Boolean(String(lastMessage.question || '').trim());
  const role = String(lastMessage.role || '').toLowerCase();
  const modeRoles = triggerRolesByMode[MODE] || triggerRolesByMode.critic;

  if (RESPOND_FILTER === 'question_only') {
    return hasQuestion;
  }

  return hasQuestion || modeRoles.has(role);
}

function normalizeOutput(parsed, fallbackText) {
  const fallbackQuestion = 'What single follow-up test would most reduce uncertainty here?';

  if (parsed && typeof parsed === 'object') {
    const content = String(parsed.content || '').trim();
    const question = String(parsed.question || '').trim();
    return {
      content: content || trunc(String(fallbackText || '').trim(), 1100),
      question: question || fallbackQuestion,
    };
  }

  return {
    content: trunc(String(fallbackText || '').trim(), 1100),
    question: fallbackQuestion,
  };
}

async function generateReply(lastMessage, messages, papers) {
  if (USE_MOCK_OPENAI) {
    const mock = buildMockModelOutput(lastMessage, papers);
    return {
      role:
        MODE === 'summarizer'
          ? 'summary'
          : MODE === 'builder'
            ? 'experiments'
            : MODE === 'scout'
              ? 'related-work'
              : 'critique',
      content: trunc(String(mock.content || ''), 1190),
      question: trunc(String(mock.question || ''), 210),
      citation: trunc(String(mock.citation || ''), 200),
      reply_to: String(lastMessage.id || '').trim(),
    };
  }

  const context = {
    lastMessage: JSON.stringify(
      {
        id: lastMessage.id,
        agent_name: lastMessage.agent_name,
        role: lastMessage.role,
        content: lastMessage.content,
        citation: lastMessage.citation,
        question: lastMessage.question,
      },
      null,
      2,
    ),
    thread: JSON.stringify(
      messages.slice(-8).map((m) => ({
        id: m.id,
        agent_name: m.agent_name,
        role: m.role,
        content: trunc(m.content, 500),
        citation: m.citation || null,
        question: m.question || null,
      })),
      null,
      2,
    ),
    papers: JSON.stringify(
      (Array.isArray(papers) ? papers : []).map((p) => ({
        paper_id: p.paper_id,
        title: p.title,
      })),
      null,
      2,
    ),
    carryCitation: String(lastMessage.citation || '').trim(),
  };

  const data = await callOpenAIWithRetry(buildSystemPrompt(), buildUserPrompt(context));
  const text = extractResponseText(data);
  const parsed = parseJsonObjectFromText(text);
  const normalized = normalizeOutput(parsed, text);

  return {
    role:
      MODE === 'summarizer'
        ? 'summary'
        : MODE === 'builder'
          ? 'experiments'
          : MODE === 'scout'
            ? 'related-work'
            : 'critique',
    content: trunc(normalized.content, 1190),
    question: trunc(normalized.question, 210),
    citation: trunc(String(lastMessage.citation || ''), 200),
    reply_to: String(lastMessage.id || '').trim(),
  };
}

async function tick() {
  const room = await litrevRequest(`/api/rooms/${encodeURIComponent(ROOM_ID)}/messages`);
  const messages = Array.isArray(room.messages) ? room.messages : [];
  if (!messages.length) return;

  const last = messages[messages.length - 1];
  if (!last || !last.id) return;

  if (!state.lastSeenMessageId && !state.startedFromEmptyRoom) {
    state.lastSeenMessageId = last.id;
    console.log(`[${nowIso()}] initialized last_seen_message_id=${state.lastSeenMessageId}`);
    return;
  }

  if (last.id === state.lastSeenMessageId) {
    return;
  }

  const lastAgentId = String(last.agent_id || '').trim();
  const lastAgentName = String(last.agent_name || '').trim().toLowerCase();
  const selfName = String(state.selfName || '').trim().toLowerCase();

  if ((state.selfAgentId && lastAgentId === state.selfAgentId) || (selfName && lastAgentName === selfName)) {
    state.lastSeenMessageId = last.id;
    console.log(`[${nowIso()}] skip: latest message is from this agent (${last.id})`);
    return;
  }

  if (!shouldRespond(last)) {
    state.lastSeenMessageId = last.id;
    console.log(`[${nowIso()}] skip: trigger filter not met for message ${last.id}`);
    return;
  }

  const latestIntentIndex = findLatestIntentMessageIndex(messages);
  if (MODE !== 'scout' && latestIntentIndex >= 0 && !hasScoutReplyAfter(messages, latestIntentIndex)) {
    state.lastSeenMessageId = last.id;
    console.log(`[${nowIso()}] waiting for scout output before mode=${MODE} response`);
    return;
  }

  if (state.lastPostedAtMs && MIN_SECONDS_BETWEEN_POSTS > 0) {
    const elapsedSec = (Date.now() - state.lastPostedAtMs) / 1000;
    if (elapsedSec < MIN_SECONDS_BETWEEN_POSTS) {
      state.lastSeenMessageId = last.id;
      console.log(
        `[${nowIso()}] skip: cooldown (${elapsedSec.toFixed(1)}s < ${MIN_SECONDS_BETWEEN_POSTS}s) for message ${last.id}`,
      );
      return;
    }
  }

  const papersResponse = await litrevRequest('/api/papers').catch(() => ({ papers: [] }));
  let papers = Array.isArray(papersResponse.papers) ? papersResponse.papers : [];
  papers = await maybeIngestFromMessage(last, papers);

  console.log(`[${nowIso()}] responding to message ${last.id} in mode=${MODE}`);
  let payload;
  try {
    const rawPayload = await generateReply(last, messages, papers);
    payload = normalizeMessagePayload(rawPayload, {
      agent_id: state.selfAgentId,
      agent_name: state.selfName,
      mode: MODE,
    });
  } catch (err) {
    state.lastSeenMessageId = last.id;
    console.error(
      `[${nowIso()}] payload normalization failed agent=${state.selfAgentId || state.selfName || 'unknown'} mode=${MODE}: ${err.message}`,
    );
    if (err.payload) {
      console.error(`normalized_payload=${JSON.stringify(err.payload).slice(0, 1600)}`);
    }
    if (err.rawInput) {
      console.error(`raw_payload=${JSON.stringify(err.rawInput).slice(0, 1600)}`);
    }
    return;
  }

  if (!payload.reply_to) {
    state.lastSeenMessageId = last.id;
    return;
  }

  try {
    const posted = await litrevRequest(`/api/rooms/${encodeURIComponent(ROOM_ID)}/messages`, {
      method: 'POST',
      body: payload,
    });
    const postedId = posted && posted.message && posted.message.id ? posted.message.id : '(unknown)';
    console.log(`[${nowIso()}] posted reply ${postedId}`);
    state.lastPostedAtMs = Date.now();
    state.lastSeenMessageId = postedId !== '(unknown)' ? postedId : last.id;
  } catch (err) {
    // Mark observed so we don't spin forever on same message when blocked.
    state.lastSeenMessageId = last.id;
    if (Number(err.status) === 409) {
      console.warn(`[${nowIso()}] post skipped by double-post guard: ${err.message}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const me = await litrevRequest('/api/me');
  state.selfAgentId = String((me && (me.agent_id || me.id)) || '').trim();
  state.selfName = String((me && me.name) || '').trim();
  if (!state.lastSeenMessageId) {
    try {
      const room = await litrevRequest(`/api/rooms/${encodeURIComponent(ROOM_ID)}/messages`);
      const msgs = Array.isArray(room.messages) ? room.messages : [];
      if (msgs.length) {
        const latest = msgs[msgs.length - 1];
        state.lastSeenMessageId = String((latest && latest.id) || '').trim();
        if (state.lastSeenMessageId) {
          console.log(`[${nowIso()}] startup baseline last_seen_message_id=${state.lastSeenMessageId}`);
        }
      } else {
        state.startedFromEmptyRoom = true;
      }
    } catch (_) {
      state.startedFromEmptyRoom = true;
    }
  }

  console.log(`[${nowIso()}] runner started`);
  console.log(`BASE=${BASE}`);
  console.log(`ROOM_ID=${ROOM_ID}`);
  console.log(`MODE=${MODE}`);
  console.log(`AGENT_ID=${state.selfAgentId || '(unknown)'}`);
  console.log(`AGENT_NAME=${state.selfName || '(unknown)'}`);
  console.log(`DEMO_MODE=${DEMO_MODE ? '1' : '0'}`);
  console.log(`POLL_SECONDS=${POLL_SECONDS}`);
  console.log(`MIN_SECONDS_BETWEEN_POSTS=${MIN_SECONDS_BETWEEN_POSTS}`);
  console.log(`STARTED_FROM_EMPTY_ROOM=${state.startedFromEmptyRoom ? '1' : '0'}`);
  console.log(`MOCK_OPENAI=${USE_MOCK_OPENAI ? '1' : '0'}`);
  console.log(`OPENAI_ENABLE_WEB_SEARCH=${ENABLE_WEB_SEARCH ? '1' : '0'}`);
  console.log(`AUTO_INGEST_URLS=${AUTO_INGEST_URLS ? '1' : '0'}`);

  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error(`[${nowIso()}] tick error: ${err.message}`);
      if (err.hint) {
        console.error(`hint: ${err.hint}`);
      }
    }
    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((err) => {
  console.error(`[${nowIso()}] fatal: ${err.message}`);
  process.exit(1);
});
