import test from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeEventName,
  resolveEventMeta,
  escapeHtml,
  escapeMarkdown,
  formatCoolifyMessage,
  BALE_MAX_MESSAGE_LENGTH,
} from '../src/formatter.js';

test('escapeMarkdown escapes special markdown characters', () => {
  assert.equal(escapeMarkdown('hello *world* `code` [link] _italics_'), 'hello \\*world\\* \\`code\\` \\[link\\] \\_italics\\_');
  assert.equal(escapeMarkdown(null), '');
  assert.equal(escapeMarkdown(undefined), '');
});

test('escapeHtml escapes HTML special characters', () => {
  assert.equal(escapeHtml('<script>alert("xss")&foo\'bar\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&amp;foo&#39;bar&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
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

test('formatCoolifyMessage formats standard deployment payload as Markdown by default', () => {
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

  assert.match(output, /🚀 \*Deployment Success\*/);
  assert.match(output, /\*Application:\* my-app/);
  assert.match(output, /\*Project:\* my-project/);
  assert.match(output, /\*Server:\* production/);
  assert.match(output, /New version successfully deployed/);
  assert.match(output, /🔗 \[https:\/\/example\.com\]\(https:\/\/example\.com\)/);
  assert.match(output, /\*Deployment UUID:\* abc123uuid/);
  assert.equal(output.includes('<b>'), false);
  assert.equal(output.includes('<code>'), false);
});

test('formatCoolifyMessage supports HTML mode when requested', () => {
  const payload = {
    event: 'deployment_success',
    success: true,
    message: 'New version successfully deployed',
    application_name: 'my-app',
    deployment_uuid: 'abc123uuid',
    fqdn: 'https://example.com',
  };

  const output = formatCoolifyMessage(payload, { parseMode: 'HTML' });

  assert.match(output, /🚀 <b>Deployment Success<\/b>/);
  assert.match(output, /<b>Application:<\/b> my-app/);
  assert.match(output, /<code>abc123uuid<\/code>/);
  assert.match(output, /🔗 <a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/);
});

test('formatCoolifyMessage escapes user strings and prevents markdown breaking', () => {
  const payload = {
    event: 'test',
    application_name: 'app_*test*_[v1]',
    project_name: 'proj`code`',
    message: 'Hello *world*',
  };

  const output = formatCoolifyMessage(payload);

  assert.equal(output.includes('app\\_\\*test\\*\\_\\[v1\\]'), true);
  assert.equal(output.includes('proj\\`code\\`'), true);
  assert.equal(output.includes('Hello \\*world\\*'), true);
});

test('formatCoolifyMessage handles missing fields gracefully', () => {
  const payload = {};
  const output = formatCoolifyMessage(payload);

  assert.match(output, /🔔 \*Notification\*/);
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

  assert.match(output, /\*Raw Payload:\*/);
  assert.equal(output.length <= BALE_MAX_MESSAGE_LENGTH, true);
  assert.match(output, /\(truncated\)/);
});
