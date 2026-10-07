import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/server.js';

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

test('Integration: full server routes test', async (t) => {
  // 1. Setup mock Bale server
  let mockBaleShouldFail = false;
  let receivedBaleMessage = null;

  const mockBaleServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (mockBaleShouldFail) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error_code: 500, description: 'Bale internal error' }));
        return;
      }
      receivedBaleMessage = parseRequestBody(req, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1234 } }));
    });
  });

  await new Promise(resolve => mockBaleServer.listen(0, '127.0.0.1', resolve));
  const balePort = mockBaleServer.address().port;
  const baleBaseUrl = `http://127.0.0.1:${balePort}`;

  // 2. Setup Express App
  const testWebhooks = new Map([
    [
      'production',
      {
        id: 'production',
        secret: 'prod-secret-key-999',
        baleBotToken: 'bot12345:token',
        baleChatId: 'chat999',
      },
    ],
  ]);

  const testConfig = {
    port: 0,
    host: '127.0.0.1',
    logRequests: false,
    includeRawPayload: false,
    disableLinkPreviews: true,
    rateLimitWindowMs: 60000,
    rateLimitMax: 100,
    baleApiBaseUrl: baleBaseUrl,
    baleRequestTimeoutMs: 2000,
  };

  const app = createApp(testWebhooks, testConfig);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const appPort = server.address().port;
  const appBaseUrl = `http://127.0.0.1:${appPort}`;

  t.after(() => {
    server.close();
    mockBaleServer.close();
  });

  // Health endpoint test
  await t.test('GET /health returns 200 and configured webhook count', async () => {
    const res = await fetch(`${appBaseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, configuredWebhooks: 1 });
  });

  // Unknown route test
  await t.test('GET /unknown-route returns 404', async () => {
    const res = await fetch(`${appBaseUrl}/non-existent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  // Unknown webhook ID test
  await t.test('POST /webhook/unknown returns 404', async () => {
    const res = await fetch(`${appBaseUrl}/webhook/staging`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer prod-secret-key-999',
      },
      body: JSON.stringify({ event: 'test' }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Webhook configuration not found/);
  });

  // Missing Authorization header test
  await t.test('POST /webhook/production without Authorization returns 401', async () => {
    const res = await fetch(`${appBaseUrl}/webhook/production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: 'Unauthorized' });
  });

  // Wrong secret test
  await t.test('POST /webhook/production with invalid secret returns 401', async () => {
    const res = await fetch(`${appBaseUrl}/webhook/production`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret',
      },
      body: JSON.stringify({ event: 'test' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: 'Unauthorized' });
  });

  // Malformed JSON test
  await t.test('POST /webhook/production with malformed JSON returns 400', async () => {
    const res = await fetch(`${appBaseUrl}/webhook/production`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer prod-secret-key-999',
      },
      body: '{ broken json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Malformed JSON payload/);
  });

  // Successful webhook forward using query token (?token=...)
  await t.test('POST /webhook/production?token=... forwards to Bale and returns 200', async () => {
    mockBaleShouldFail = false;
    receivedBaleMessage = null;

    const res = await fetch(`${appBaseUrl}/webhook/production?token=prod-secret-key-999`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'deployment_success',
        application_name: 'query-token-app',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
    assert.match(receivedBaleMessage.text, /query-token-app/);
  });

  // Successful webhook forward
  await t.test('POST /webhook/production with valid payload forwards to Bale and returns 200', async () => {
    mockBaleShouldFail = false;
    receivedBaleMessage = null;

    const res = await fetch(`${appBaseUrl}/webhook/production`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer prod-secret-key-999',
      },
      body: JSON.stringify({
        event: 'deployment_success',
        application_name: 'test-app',
        project_name: 'test-project',
        message: 'Deployed version v1.2.3',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });

    assert(receivedBaleMessage !== null);
    assert.equal(receivedBaleMessage.chat_id, 'chat999');
    assert.match(receivedBaleMessage.text, /🚀 <b>Deployment Success<\/b>/);
    assert.match(receivedBaleMessage.text, /test-app/);
  });

  // Bale failure returns 502 without leaking secrets
  await t.test('POST /webhook/production returns 502 when Bale fails', async () => {
    mockBaleShouldFail = true;

    const res = await fetch(`${appBaseUrl}/webhook/production`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer prod-secret-key-999',
      },
      body: JSON.stringify({
        event: 'deployment_failed',
        message: 'Build error',
      }),
    });

    assert.equal(res.status, 502);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: false,
      error: 'Failed to send notification to Bale',
    });
  });
});
