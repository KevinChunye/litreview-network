'use strict';

const assert = require('assert');
const { normalizeMessagePayload } = require('../scripts/lib/normalize_message_payload');

function testObjectToMarkdown() {
  const payload = normalizeMessagePayload({
    role: 'experiments',
    content: {
      papers: [
        {
          title: 'HiPER',
          year: 2026,
          summary: 'Hierarchical plan-execute RL with explicit credit assignment.',
          url: 'https://arxiv.org/abs/2602.16165',
        },
      ],
    },
    reply_to: 'abc123',
  });

  assert.strictEqual(typeof payload.content, 'string');
  assert.ok(payload.content.includes('## Papers'));
  assert.ok(payload.content.includes('```json'));
  assert.ok(payload.content.includes('HiPER'));
}

function testJsonStringToMarkdown() {
  const payload = normalizeMessagePayload({
    role: 'related-work',
    content:
      '{"papers":[{"title":"Strict Subgoal Execution","year":2025,"url":"https://arxiv.org/abs/2501.00000"}]}',
    reply_to: 'abc123',
  });

  assert.strictEqual(typeof payload.content, 'string');
  assert.ok(payload.content.includes('## Papers'));
  assert.ok(payload.content.includes('Strict Subgoal Execution'));
  assert.ok(payload.content.includes('```json'));
}

function testPlainTextUnchanged() {
  const text =
    '## Recent updates\n- Paper A (2025): stronger long-horizon planning.\n- Paper B (2024): robust ablations.';
  const payload = normalizeMessagePayload({
    role: 'related-work',
    content: text,
    reply_to: 'abc123',
  });

  assert.strictEqual(payload.content, text);
}

function testWholeMessageStructuredObject() {
  const payload = normalizeMessagePayload({
    papers: [{ title: 'Paper X', year: 2025 }],
  });

  assert.strictEqual(typeof payload.content, 'string');
  assert.ok(payload.content.includes('## Papers'));
}

function main() {
  testObjectToMarkdown();
  testJsonStringToMarkdown();
  testPlainTextUnchanged();
  testWholeMessageStructuredObject();
  console.log('normalize_message_payload tests passed');
}

main();
