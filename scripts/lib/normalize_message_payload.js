'use strict';

const MESSAGE_FIELDS = new Set(['role', 'content', 'reply_to', 'citation', 'question']);

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isMessageLike(value) {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some((key) => MESSAGE_FIELDS.has(key));
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function renderPapersMarkdown(papers) {
  const lines = ['## Papers'];
  const subset = Array.isArray(papers) ? papers.slice(0, 8) : [];
  if (!subset.length) {
    lines.push('- No paper entries found.');
    return lines.join('\n');
  }

  subset.forEach((paper, index) => {
    if (!isPlainObject(paper)) {
      lines.push(`- Paper ${index + 1}: ${cleanText(paper)}`);
      return;
    }
    const title = cleanText(paper.title) || `Paper ${index + 1}`;
    const year = cleanText(paper.year);
    const summary = cleanText(paper.summary || paper.why_relevant || paper.reason || '');
    const url = cleanText(paper.url || paper.link || '');

    lines.push(`- **${title}**${year ? ` (${year})` : ''}${summary ? ` — ${summary}` : ''}`);
    if (url) {
      lines.push(`  - URL: ${url}`);
    }
  });

  return lines.join('\n');
}

function renderGenericObjectMarkdown(data) {
  const lines = ['## Structured Content'];
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      lines.push(`- **${key}:** (empty)`);
      return;
    }
    if (Array.isArray(value)) {
      lines.push(`- **${key}:** ${value.length} item(s)`);
      return;
    }
    if (isPlainObject(value)) {
      lines.push(`- **${key}:** object`);
      return;
    }
    lines.push(`- **${key}:** ${cleanText(value)}`);
  });
  return lines.join('\n');
}

function renderStructuredMarkdown(data) {
  const markdown = isPlainObject(data) && Array.isArray(data.papers)
    ? renderPapersMarkdown(data.papers)
    : renderGenericObjectMarkdown(data);
  const rawJson = JSON.stringify(data, null, 2);
  return `${markdown}\n\n\`\`\`json\n${rawJson}\n\`\`\``;
}

function parseJsonIfPossible(text) {
  const input = cleanText(text);
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

function normalizeContentToMarkdown(content, ctx = {}) {
  if (isPlainObject(content) || Array.isArray(content)) {
    console.warn(
      `[${new Date().toISOString()}] normalized structured content -> markdown (object) agent=${ctx.agent_id || ctx.agent_name || 'unknown'}`,
    );
    return renderStructuredMarkdown(content);
  }

  if (typeof content === 'string') {
    const trimmed = cleanText(content);
    const parsed = parseJsonIfPossible(trimmed);
    if (parsed && (isPlainObject(parsed) || Array.isArray(parsed))) {
      console.warn(
        `[${new Date().toISOString()}] normalized structured content -> markdown (json-string) agent=${ctx.agent_id || ctx.agent_name || 'unknown'}`,
      );
      return renderStructuredMarkdown(parsed);
    }
    return trimmed;
  }

  return cleanText(content);
}

function normalizeMessagePayload(input, ctx = {}) {
  const message = isMessageLike(input) ? { ...input } : { content: input };
  if (message.content === undefined && !isMessageLike(input)) {
    message.content = input;
  }

  message.content = normalizeContentToMarkdown(message.content, ctx);

  if (typeof message.content !== 'string') {
    const err = new Error('Invalid message payload: content must be a string after normalization.');
    err.payload = message;
    err.rawInput = input;
    throw err;
  }

  return message;
}

module.exports = {
  normalizeMessagePayload,
  normalizeContentToMarkdown,
  renderStructuredMarkdown,
};
