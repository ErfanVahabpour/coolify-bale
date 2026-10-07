import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWebhooks, parseBoolean } from '../src/config.js';

test('parseBoolean helper', () => {
  assert.equal(parseBoolean('true', false), true);
  assert.equal(parseBoolean('TRUE', false), true);
  assert.equal(parseBoolean('1', false), true);
  assert.equal(parseBoolean('yes', false), true);
  assert.equal(parseBoolean('false', true), false);
  assert.equal(parseBoolean('0', true), false);
  assert.equal(parseBoolean('no', true), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean('', false), false);
});

test('loadWebhooks parses valid configuration', () => {
  const json = JSON.stringify([
    {
      id: 'production',
      secret: 'sec-prod-123',
      baleBotToken: '123456:token',
      baleChatId: '987654321',
    },
    {
      id: 'staging',
      secret: 'sec-stage-456',
      baleBotToken: '654321:token',
      baleChatId: 12345,
    },
  ]);

  const map = loadWebhooks(json);
  assert.equal(map.size, 2);
  assert.equal(map.has('production'), true);
  assert.equal(map.get('production').secret, 'sec-prod-123');
  assert.equal(map.get('production').baleChatId, '987654321');
  assert.equal(map.get('staging').baleChatId, '12345');
});

test('loadWebhooks errors on missing or empty string', () => {
  assert.throws(() => loadWebhooks(''), /Environment variable WEBHOOKS is required/);
  assert.throws(() => loadWebhooks('   '), /Environment variable WEBHOOKS is required/);
});

test('loadWebhooks errors on invalid JSON', () => {
  assert.throws(() => loadWebhooks('{ invalid'), /Invalid JSON syntax/);
});

test('loadWebhooks errors on non-array JSON', () => {
  assert.throws(() => loadWebhooks('{"id": "production"}'), /must be a JSON array/);
});

test('loadWebhooks errors on empty array', () => {
  assert.throws(() => loadWebhooks('[]'), /must contain at least one/);
});

test('loadWebhooks validates required fields', () => {
  assert.throws(
    () => loadWebhooks('[{"secret":"s","baleBotToken":"b","baleChatId":"c"}]'),
    /missing a valid 'id'/
  );
  assert.throws(
    () => loadWebhooks('[{"id":"test*bad","secret":"s","baleBotToken":"b","baleChatId":"c"}]'),
    /must contain only letters, numbers, hyphens/
  );
  assert.throws(
    () => loadWebhooks('[{"id":"test","baleBotToken":"b","baleChatId":"c"}]'),
    /missing a valid 'secret'/
  );
  assert.throws(
    () => loadWebhooks('[{"id":"test","secret":"s","baleChatId":"c"}]'),
    /missing a valid 'baleBotToken'/
  );
  assert.throws(
    () => loadWebhooks('[{"id":"test","secret":"s","baleBotToken":"b"}]'),
    /missing a valid 'baleChatId'/
  );
});

test('loadWebhooks detects duplicate ids', () => {
  const json = JSON.stringify([
    { id: 'app', secret: 's1', baleBotToken: 't1', baleChatId: 'c1' },
    { id: 'app', secret: 's2', baleBotToken: 't2', baleChatId: 'c2' },
  ]);
  assert.throws(() => loadWebhooks(json), /Duplicate webhook id found: "app"/);
});
