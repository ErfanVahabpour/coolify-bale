import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  humanizeEventName,
  resolveEventMeta,
  formatCoolifyMessage,
} from '../src/formatter.js';

test('escapeHtml handles dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("xss")&\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(123), '123');
});

test('humanizeEventName formats unknown events nicely', () => {
  assert.equal(humanizeEventName('deployment_something_new'), 'Deployment Something New');
  assert.equal(humanizeEventName('server-disk-full'), 'Server Disk Full');
  assert.equal(humanizeEventName(''), 'Notification');
  assert.equal(humanizeEventName(null), 'Notification');
});

test('resolveEventMeta maps known and unknown events', () => {
  assert.deepEqual(resolveEventMeta('deployment_success'), {
    emoji: '🚀',
    title: 'Deployment Success',
  });
  assert.deepEqual(resolveEventMeta('backup_failed'), {
    emoji: '❌',
    title: 'Backup Failed',
  });
  assert.deepEqual(resolveEventMeta('server_reachable'), {
    emoji: '🟢',
    title: 'Server Reachable',
  });
  assert.deepEqual(resolveEventMeta('server_unreachable'), {
    emoji: '🔴',
    title: 'Server Unreachable',
  });
  assert.deepEqual(resolveEventMeta('container_status_changed'), {
    emoji: '📦',
    title: 'Container Status Changed',
  });

  // Unknown event fallback
  assert.deepEqual(resolveEventMeta('custom_event_fired'), {
    emoji: '🔔',
    title: 'Custom Event Fired',
  });
});

test('formatCoolifyMessage formats standard deployment payload', () => {
  const payload = {
    event: 'deployment_success',
    success: true,
    message: 'New version successfully deployed',
    application_name: 'my-app',
    project_name: 'my-project',
    server_name: 'production',
    deployment_uuid: 'abc123uuid',
    fqdn: 'https://example.com',
  };

  const output = formatCoolifyMessage(payload);

  assert.match(output, /🚀 <b>Deployment Success<\/b>/);
  assert.match(output, /<b>Application:<\/b> my-app/);
  assert.match(output, /<b>Project:<\/b> my-project/);
  assert.match(output, /<b>Server:<\/b> production/);
  assert.match(output, /New version successfully deployed/);
  assert.match(output, /🔗 <a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/);
  assert.match(output, /<code>abc123uuid<\/code>/);
});

test('formatCoolifyMessage escapes user strings and prevents injection', () => {
  const payload = {
    event: 'test',
    application_name: '<script>evil()</script>',
    project_name: '<b>bold</b>',
    message: 'Hello & welcome <world>',
    deployment_uuid: 'uuid&123',
    fqdn: 'https://example.com?a=1&b=2',
  };

  const output = formatCoolifyMessage(payload);

  assert.equal(output.includes('<script>'), false);
  assert.equal(output.includes('&lt;script&gt;evil()&lt;/script&gt;'), true);
  assert.equal(output.includes('&lt;b&gt;bold&lt;/b&gt;'), true);
  assert.equal(output.includes('Hello &amp; welcome &lt;world&gt;'), true);
  assert.equal(output.includes('uuid&amp;123'), true);
  assert.equal(output.includes('https://example.com?a=1&amp;b=2'), true);
});

test('formatCoolifyMessage handles missing fields gracefully', () => {
  const payload = {};
  const output = formatCoolifyMessage(payload);

  assert.match(output, /🔔 <b>Notification<\/b>/);
  assert.equal(output.includes('Application:'), false);
  assert.equal(output.includes('Server:'), false);
  assert.equal(output.includes('🔗'), false);
});

test('formatCoolifyMessage appends and truncates raw payload when requested', () => {
  const payload = {
    event: 'deployment_success',
    application_name: 'app',
    huge_data: 'x'.repeat(6000),
  };

  const output = formatCoolifyMessage(payload, { includeRawPayload: true });

  assert.match(output, /<b>Raw Payload:<\/b>/);
  assert.equal(output.length <= 4000, true);
  assert.match(output, /\(truncated\)/);
});
