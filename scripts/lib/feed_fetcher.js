/**
 * feed_fetcher.js — arXiv fetcher for the Paper Feed pipeline.
 *
 * PaperItem schema:
 *   id             string   arXiv ID (e.g. "2310.00123")
 *   title          string
 *   authors        string[]
 *   year           number
 *   venue          string   "arXiv"
 *   abstract       string
 *   url_pdf        string   https://arxiv.org/pdf/{id}
 *   url_abs        string   https://arxiv.org/abs/{id}
 *   source         string   "arxiv"
 *   score          number   recency-based (0–1)
 *   tags           string[] inferred from topic keywords
 *   fetched_at     string   ISO timestamp
 *   room_id        string?  optional, set on "Send to Room"
 *   tldr_1         string   one-sentence summary (heuristic)
 *   why_recommended string[] 2-3 bullets tied to topic (heuristic)
 */

'use strict';

const https = require('https');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/** Strip XML tags from an arXiv atom entry field */
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Parse arXiv Atom XML into a list of entry objects */
function parseAtom(xml) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const hit = r.exec(e);
      return hit ? stripTags(hit[1]) : '';
    };
    const getAll = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      const results = [];
      let h;
      while ((h = r.exec(e)) !== null) results.push(stripTags(h[1]));
      return results;
    };
    const id = get('id').replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');
    const published = get('published');   // 2024-01-15T00:00:00Z
    const year = published ? parseInt(published.slice(0, 4), 10) : null;
    const authors = getAll('name');
    entries.push({ id, title: get('title'), abstract: get('summary'), published, year, authors });
  }
  return entries;
}

// ─── TLDR + why_recommended (deterministic heuristics) ───────────────────────

const STOP_WORDS = new Set([
  'a','an','the','of','in','on','for','to','and','or','is','are','was','were',
  'with','this','that','we','our','their','these','by','be','has','have','it',
  'as','at','from','not','but','which','its','can','also','paper','show','use',
  'present','propose','using','used','based','method','methods','model','models',
  'approach','approaches','work','works','new','novel','first','results','result',
  'into','both','than','more','such','each','all','through','via','how','when',
  'than','over','about','between','among','while','after','before',
]);

/** Score a sentence by keyword overlap with topic words */
function sentenceScore(sentence, topicWords) {
  const lower = sentence.toLowerCase();
  return topicWords.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
}

/** Extract meaningful keywords from a topic string */
function topicKeywords(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Pick the most representative sentence from the abstract as a 1-line TLDR */
function makeTldr(abstract, topicWords) {
  const sentences = abstract.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  if (!sentences.length) return abstract.slice(0, 180).trim() + '…';
  // Prefer the first sentence if it mentions a topic keyword, else pick best scored
  const first = sentences[0];
  const firstScore = sentenceScore(first, topicWords);
  if (firstScore > 0 || sentences.length === 1) {
    return first.length > 200 ? first.slice(0, 200).trim() + '…' : first;
  }
  // Find highest-scoring sentence
  let best = first;
  let bestScore = firstScore;
  for (const s of sentences.slice(1, 5)) {
    const sc = sentenceScore(s, topicWords);
    if (sc > bestScore) { best = s; bestScore = sc; }
  }
  return best.length > 200 ? best.slice(0, 200).trim() + '…' : best;
}

/** Generate 2-3 "why recommended" bullets from the abstract */
function makeWhyRecommended(title, abstract, topic, topicWords) {
  const bullets = [];
  const lower = abstract.toLowerCase();

  // Bullet 1: direct keyword match snippet
  for (const kw of topicWords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(abstract.length, idx + kw.length + 80);
      const snippet = abstract.slice(start, end).replace(/^\W+/, '').replace(/\W+$/, '');
      bullets.push(`Directly addresses "${kw}": "…${snippet}…"`);
      break;
    }
  }

  // Bullet 2: what the paper does / contribution
  const verbPhrases = [
    /we (propose|present|introduce|develop|demonstrate|show|study|investigate|evaluate)[^.]{10,80}/i,
    /this (paper|work|study) (propose|present|introduce|develop|demonstrate|shows?|studies|investigates?|evaluates?)[^.]{10,80}/i,
    /we (achieve|obtain|outperform|surpass)[^.]{10,80}/i,
  ];
  for (const re of verbPhrases) {
    const hit = re.exec(abstract);
    if (hit) { bullets.push('Contribution: ' + hit[0].replace(/\s+/g, ' ').trim() + '.'); break; }
  }

  // Bullet 3: relevance to topic area
  const topicPhrases = [
    /\b(state.of.the.art|sota|benchmark|outperform|new record|best.known)[^.]{0,60}/i,
    /\b(dataset|evaluation|experiment|ablation|baseline)[^.]{10,60}/i,
  ];
  for (const re of topicPhrases) {
    const hit = re.exec(abstract);
    if (hit) { bullets.push('Evidence: ' + hit[0].replace(/\s+/g, ' ').trim() + '.'); break; }
  }

  if (!bullets.length) {
    bullets.push(`Relevant to topic "${topic}" based on title and abstract keywords.`);
  }
  return bullets.slice(0, 3);
}

/** Infer display tags from topic keywords + title words */
function inferTags(topic, title) {
  const combined = (topic + ' ' + title).toLowerCase();
  const candidates = combined.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(
    (w) => w.length > 3 && !STOP_WORDS.has(w),
  );
  return [...new Set(candidates)].slice(0, 5);
}

// ─── Recency score ────────────────────────────────────────────────────────────

/** Score between 0 (old) and 1 (newest), within the fetched batch */
function recencyScores(entries) {
  const dates = entries.map((e) => new Date(e.published || 0).getTime());
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const range = max - min || 1;
  return entries.map((e) => (new Date(e.published || 0).getTime() - min) / range);
}

// ─── Main fetch function ──────────────────────────────────────────────────────

/**
 * Fetch top N papers from arXiv for a given topic string.
 * Returns an array of PaperItem objects.
 */
async function fetchArxivFeed(topic, { n = 5, maxResults = 20 } = {}) {
  const query = encodeURIComponent(topic);
  // Search all fields, sort by submittedDate descending
  const url =
    `https://export.arxiv.org/api/query?search_query=all:${query}` +
    `&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

  let body;
  try {
    const res = await httpsGet(url);
    if (res.status !== 200) throw new Error(`arXiv HTTP ${res.status}`);
    body = res.body;
  } catch (err) {
    throw new Error(`arXiv fetch failed: ${err.message}`);
  }

  const entries = parseAtom(body);
  if (!entries.length) return [];

  const scores = recencyScores(entries);
  const topicWords = topicKeywords(topic);
  const fetchedAt = new Date().toISOString();

  const items = entries.slice(0, n).map((e, i) => {
    const arxivId = e.id.split('v')[0]; // strip version suffix
    return {
      id: `arxiv:${arxivId}`,
      title: e.title,
      authors: e.authors.slice(0, 5),
      year: e.year,
      venue: 'arXiv',
      abstract: e.abstract,
      url_pdf: `https://arxiv.org/pdf/${arxivId}`,
      url_abs: `https://arxiv.org/abs/${arxivId}`,
      source: 'arxiv',
      score: Math.round(scores[i] * 1000) / 1000,
      tags: inferTags(topic, e.title),
      fetched_at: fetchedAt,
      room_id: null,
      tldr_1: makeTldr(e.abstract, topicWords),
      why_recommended: makeWhyRecommended(e.title, e.abstract, topic, topicWords),
    };
  });

  return items;
}

module.exports = { fetchArxivFeed, topicKeywords };
