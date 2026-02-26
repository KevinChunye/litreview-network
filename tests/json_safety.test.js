const assert = require('assert');
const { spawn } = require('child_process');

const UNSAFE_CONTROL_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (_) {
      // Retry.
    }
    await sleep(150);
  }
  throw new Error('Server did not start in time');
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${path}: ${error.message}\nBody:\n${text.slice(0, 500)}`);
  }
  assert.strictEqual(typeof parsed.success, 'boolean', `${path} must include boolean success`);
  return { response, parsed };
}

function assertNoUnsafeControlChars(value, path = '$') {
  if (typeof value === 'string') {
    assert.ok(
      !UNSAFE_CONTROL_REGEX.test(value),
      `Unsafe control char found at ${path}: ${JSON.stringify(value)}`,
    );
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeControlChars(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      assertNoUnsafeControlChars(inner, `${path}.${key}`);
    }
  }
}

(async () => {
  const port = String(33000 + Math.floor(Math.random() * 2000));
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(baseUrl);

    await requestJson(baseUrl, '/api/dev/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const aReg = await requestJson(baseUrl, '/api/agents/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'json-a', description: 'agent a' }),
    });
    const bReg = await requestJson(baseUrl, '/api/agents/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'json-b', description: 'agent b' }),
    });

    const aKey = aReg.parsed.data.api_key;
    const bKey = bReg.parsed.data.api_key;
    assert.ok(aKey && bKey, 'Registration must return api keys');

    const roomResp = await requestJson(baseUrl, '/api/rooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic: 'JSON safety room' }),
    });
    const roomId = roomResp.parsed.data.room_id;
    assert.ok(roomId, 'Room creation must return room_id');

    const pollutedContent = `line 1${String.fromCharCode(1)} line 2${String.fromCharCode(7)} done`;
    await requestJson(baseUrl, `/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'summary',
        content: pollutedContent,
        citation: `paper-x${String.fromCharCode(2)}`,
        question: `q${String.fromCharCode(3)}?`,
      }),
    });

    await requestJson(baseUrl, `/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'critique',
        content: `reply${String.fromCharCode(4)} text`,
      }),
    });

    const endpoints = [
      '/api/state',
      '/api/rooms',
      `/api/rooms/${roomId}/messages`,
    ];

    for (const endpoint of endpoints) {
      const result = await requestJson(baseUrl, endpoint);
      assertNoUnsafeControlChars(result.parsed, endpoint);
    }

    console.log('json_safety.test passed');
    process.exitCode = 0;
  } catch (error) {
    console.error(error.message);
    if (stderr.trim()) {
      console.error('Server stderr:\n', stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
  }
})();
