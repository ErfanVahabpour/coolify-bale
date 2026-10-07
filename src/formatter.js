/**
 * Known Coolify event types with their corresponding emoji and title.
 */
const KNOWN_EVENTS = {
  deployment_success: { emoji: '🚀', title: 'Deployment Success' },
  deployment_failed: { emoji: '❌', title: 'Deployment Failed' },
  deployment_queued: { emoji: '⏳', title: 'Deployment Queued' },
  deployment_cancelled: { emoji: '⏹️', title: 'Deployment Cancelled' },
  backup_success: { emoji: '💾', title: 'Backup Success' },
  backup_failed: { emoji: '❌', title: 'Backup Failed' },
  server_reachable: { emoji: '🟢', title: 'Server Reachable' },
  server_unreachable: { emoji: '🔴', title: 'Server Unreachable' },
  server_disk_usage: { emoji: '⚠️', title: 'Server Disk Alert' },
  container_status_changed: { emoji: '📦', title: 'Container Status Changed' },
  application_status_changed: { emoji: '🔄', title: 'Application Status Changed' },
  database_status_changed: { emoji: '🗄️', title: 'Database Status Changed' },
  service_status_changed: { emoji: '🛠️', title: 'Service Status Changed' },
  status_changed: { emoji: '🔄', title: 'Status Changed' },
  test: { emoji: '🧪', title: 'Test Notification' },
  deploy: { emoji: '🚀', title: 'Deployment' },
};

const BALE_MAX_MESSAGE_LENGTH = 4000;

/**
 * Escapes characters that have special meaning in HTML.
 * @param {any} val
 * @returns {string}
 */
export function escapeHtml(val) {
  if (val === null || val === undefined) {
    return '';
  }
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats an unknown event string into Title Case.
 * Example: "deployment_something_new" -> "Deployment Something New"
 * @param {string} event
 * @returns {string}
 */
export function humanizeEventName(event) {
  if (!event || typeof event !== 'string') {
    return 'Notification';
  }
  return event
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * Resolves the appropriate emoji and title for an event.
 * @param {string | undefined} event
 * @param {boolean | undefined} success
 * @returns {{ emoji: string, title: string }}
 */
export function resolveEventMeta(event, success) {
  const normalizedEvent = (event || '').trim().toLowerCase();

  if (normalizedEvent && KNOWN_EVENTS[normalizedEvent]) {
    return KNOWN_EVENTS[normalizedEvent];
  }

  // Fallback for unknown event
  const emoji = '🔔';
  const title = normalizedEvent ? humanizeEventName(normalizedEvent) : 'Notification';

  return { emoji, title };
}

/**
 * Validates whether a string is a valid HTTP/HTTPS URL.
 * @param {string} urlStr
 * @returns {boolean}
 */
function isValidHttpUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Formats a Coolify webhook payload into an HTML-formatted Bale message.
 *
 * @param {Record<string, any>} payload
 * @param {object} [options]
 * @param {boolean} [options.includeRawPayload=false]
 * @returns {string}
 */
export function formatCoolifyMessage(payload, options = {}) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const includeRaw = Boolean(options.includeRawPayload);

  const { emoji, title } = resolveEventMeta(data.event, data.success);

  const sections = [];

  // Header
  sections.push(`${emoji} <b>${escapeHtml(title)}</b>`);

  // Key-value metadata lines
  const metaLines = [];
  if (data.application_name) {
    metaLines.push(`<b>Application:</b> ${escapeHtml(data.application_name)}`);
  }
  if (data.project_name) {
    metaLines.push(`<b>Project:</b> ${escapeHtml(data.project_name)}`);
  }
  if (data.environment_name) {
    metaLines.push(`<b>Environment:</b> ${escapeHtml(data.environment_name)}`);
  }
  if (data.server_name) {
    metaLines.push(`<b>Server:</b> ${escapeHtml(data.server_name)}`);
  }
  if (data.server_uuid) {
    metaLines.push(`<b>Server UUID:</b> <code>${escapeHtml(data.server_uuid)}</code>`);
  }
  if (data.status) {
    metaLines.push(`<b>Status:</b> ${escapeHtml(data.status)}`);
  }

  if (metaLines.length > 0) {
    sections.push(metaLines.join('\n'));
  }

  // Message or description body
  const bodyText = data.message || data.description;
  if (bodyText) {
    sections.push(escapeHtml(bodyText));
  }

  // Link / FQDN
  const targetUrl = data.fqdn || data.url;
  if (targetUrl) {
    const trimmedUrl = String(targetUrl).trim();
    if (isValidHttpUrl(trimmedUrl)) {
      sections.push(`🔗 <a href="${escapeHtml(trimmedUrl)}">${escapeHtml(trimmedUrl)}</a>`);
    } else {
      sections.push(`🔗 ${escapeHtml(trimmedUrl)}`);
    }
  }

  // Deployment UUID
  if (data.deployment_uuid) {
    sections.push(`<code>${escapeHtml(data.deployment_uuid)}</code>`);
  }

  let baseMessage = sections.join('\n\n').trim();

  // Handle optional raw payload
  if (includeRaw) {
    const rawJson = JSON.stringify(data, null, 2);
    const prefix = '\n\n<b>Raw Payload:</b>\n<pre><code>';
    const suffix = '</code></pre>';
    const overhead = prefix.length + suffix.length;

    const availableSpace = BALE_MAX_MESSAGE_LENGTH - baseMessage.length - overhead;

    if (availableSpace > 50) {
      let escapedJson = escapeHtml(rawJson);
      if (escapedJson.length > availableSpace) {
        const truncatedSnippet = escapeHtml(rawJson.slice(0, Math.max(0, availableSpace - 20))) + '\n... (truncated)';
        baseMessage += `${prefix}${truncatedSnippet}${suffix}`;
      } else {
        baseMessage += `${prefix}${escapedJson}${suffix}`;
      }
    }
  }

  // Final length sanity guard for Bale/Telegram limits
  if (baseMessage.length > BALE_MAX_MESSAGE_LENGTH) {
    baseMessage = baseMessage.slice(0, BALE_MAX_MESSAGE_LENGTH - 16) + '... (truncated)';
  }

  return baseMessage;
}
