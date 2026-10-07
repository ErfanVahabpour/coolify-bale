import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { redactSensitive, stripFormatting, sendToBale, BaleApiError } from '../src/bale.js';

function parseRequestBody(req, body) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const obj = {};
    for (const [key, value] of params.entries()) {
      if (value === 'true') obj[key] = true;
      else if (value === 'false') obj[key] = false;
      else obj[key] = value;
    }
    return obj;
  }
  return JSON.parse(body);
}

test('redactSensitive strips bot tokens', () => {
  const text = 'Failed on https://tapi.bale.ai/bot123456:ABC-DEF_xyz/sendMessage';
  assert.equal(redactSensitive(text), 'Failed on https://tapi.bale.ai/bot[REDACTED]/sendMessage');
  assert.equal(redactSensitive(null), '');
});

test('stripFormatting removes HTML and Markdown formatting tags', () => {
  assert.equal(stripFormatting('<b>Hello</b> *World* `code` [link](https://example.com)'), 'Hello World code link (https://example.com)');
  assert.equal(stripFormatting('&amp; &lt; &gt;'), '& < >');
  assert.equal(stripFormatting(null), '');
});

test('sendToBale successfully sends message to Bale API with Markdown parse_mode', async () => {
  let receivedBody = null;
  let receivedUrl = null;

  const mockServer = http.createServer((req, res) => {
    receivedUrl = req.url;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = parseRequestBody(req, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 100 } }));
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await sendToBale({
      botToken: 'my-bot-token',
      chatId: '12345678',
      text: '*Test*',
      disableLinkPreviews: true,
      baseUrl,
      timeoutMs: 2000,
    });

    assert.equal(res.message_id, 100);
    assert.equal(receivedUrl, '/botmy-bot-token/sendMessage');
    assert.equal(receivedBody.chat_id, '12345678');
    assert.equal(receivedBody.text, '*Test*');
    assert.equal(receivedBody.parse_mode, 'Markdown');
    assert.equal(receivedBody.disable_web_page_preview, true);
  } finally {
    mockServer.close();
  }
});

test('sendToBale retries without disable_web_page_preview if rejected with 400', async () => {
  let attempts = 0;
  const requests = [];

  const mockServer = http.createServer((req, res) => {
    attempts++;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = parseRequestBody(req, body);
      requests.push(parsed);
      if (attempts === 1) {
        // First attempt fails due to unrecognized parameter
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: unknown parameter disable_web_page_preview' }));
      } else {
        // Second attempt succeeds
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: 101 } }));
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await sendToBale({
      botToken: 'my-bot-token',
      chatId: '12345678',
      text: 'Hello',
      disableLinkPreviews: true,
      baseUrl,
      timeoutMs: 2000,
    });

    assert.equal(res.message_id, 101);
    assert.equal(attempts, 2);
    assert.equal(requests[0].disable_web_page_preview, true);
    assert.equal(requests[1].disable_web_page_preview, undefined);
  } finally {
    mockServer.close();
  }
});

test('sendToBale throws BaleApiError on 500 or network failure without leaking token', async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error_code: 500, description: 'Internal Server Error' }));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await assert.rejects(
      () =>
        sendToBale({
          botToken: 'secret-token-123',
          chatId: '12345678',
          text: 'Hello',
          baseUrl,
          timeoutMs: 2000,
        }),
      (err) => {
        assert(err instanceof BaleApiError);
        assert.equal(err.message.includes('secret-token-123'), false);
        return true;
      }
    );
  } finally {
    mockServer.close();
  }
});
