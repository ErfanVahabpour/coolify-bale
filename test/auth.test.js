import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeCompare, authenticateRequest } from '../src/auth.js';

test('timingSafeCompare correctly identifies matching strings', () => {
  assert.equal(timingSafeCompare('my-secret-key-123', 'my-secret-key-123'), true);
  assert.equal(timingSafeCompare('', ''), true);
  assert.equal(timingSafeCompare('a', 'b'), false);
  assert.equal(timingSafeCompare('short', 'much-longer-secret-key'), false);
  assert.equal(timingSafeCompare(null, 'secret'), false);
  assert.equal(timingSafeCompare(undefined, undefined), false);
});

test('authenticateRequest validates Bearer authorization headers', () => {
  const secret = 'super-secret-token-xyz';

  assert.equal(authenticateRequest(`Bearer ${secret}`, secret), true);
  assert.equal(authenticateRequest(`bearer ${secret}`, secret), true);
  assert.equal(authenticateRequest(`BEARER   ${secret}`, secret), true);

  // Wrong secret
  assert.equal(authenticateRequest('Bearer wrong-token', secret), false);

  // Missing or empty
  assert.equal(authenticateRequest(undefined, secret), false);
  assert.equal(authenticateRequest('', secret), false);

  // Unsupported scheme
  assert.equal(authenticateRequest(`Basic ${secret}`, secret), false);
  assert.equal(authenticateRequest(`Token ${secret}`, secret), false);

  // Malformed format
  assert.equal(authenticateRequest('Bearer', secret), false);
  assert.equal(authenticateRequest(`${secret}`, secret), false);
});
