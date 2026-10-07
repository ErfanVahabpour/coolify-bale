import { config } from './config.js';

export const BALE_MAX_MESSAGE_LENGTH = 4096;

/**
 * Known Coolify event mappings with icons and human-friendly titles.
 */
const KNOWN_EVENTS = {
  // Deployments
  deployment_success: { emoji: '🚀', title: 'Deployment Success' },
  deployment_failed: { emoji: '❌', title: 'Deployment Failed' },
  deployment_started: { emoji: '🟡', title: 'Deployment Started' },

  // Resources & Containers
  container_status_changed: { emoji: '📦', title: 'Container Status Changed' },
  container_stopped: { emoji: '⏹️', title: 'Container Stopped' },
  container_restarted: { emoji: '🔄', title: 'Container Restarted' },
  restart_limit_reached: { emoji: '⚠️', title: 'Restart Limit Reached' },

  // Backups
  backup_success: { emoji: '💾', title: 'Backup Success' },
  backup_failed: { emoji: '❌', title: 'Backup Failed' },

  // Scheduled tasks
  task_success: { emoji: '⏰', title: 'Task Success' },
  task_failed: { emoji: '❌', title: 'Task Failed' },

  // Server health
  server_reachable: { emoji: '🟢', title: 'Server Reachable' },
  server_unreachable: { emoji: '🔴', title: 'Server Unreachable' },
  server_disk_usage: { emoji: '💾', title: 'Disk Usage Warning' },
  docker_cleanup_failed: { emoji: '⚠️', title: 'Docker Cleanup Failed' },
  traefik_outdated: { emoji: '⚠️', title: 'Traefik Outdated' },
};

/**
 * Converts snake_case, kebab-case, or camelCase to Title Case words.
 * @param {string} text
 * @returns {string}
 */
export function humanizeEventName(text) {
  if (!text) return 'Notification';
  return String(text)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Escapes characters for Telegram/Bale standard Markdown.
 * Characters to escape: *, _, `, [
 * @param {any} val
 * @returns {string}
 */
export function escapeMarkdown(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/([*`_\[\]])/g, '\\$1');
}

/**
 * Escapes special HTML characters to prevent broken entities.
 * @param {any} val
 * @returns {string}
 */
export function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Determines emoji and title from event name and success flag.
 * @param {string} [event]
 * @param {boolean} [success]
 * @returns {{ emoji: string, title: string }}
 */
export function resolveEventMeta(event, success) {
  const normalizedEvent = (event || '').toLowerCase().trim();

  // Explicit success/failure heuristics
  if (success === true && normalizedEvent.includes('deploy')) {
    return KNOWN_EVENTS.deployment_success;
  }
  if (success === false && normalizedEvent.includes('deploy')) {
    return KNOWN_EVENTS.deployment_failed;
  }
  if (success === true && normalizedEvent.includes('backup')) {
    return KNOWN_EVENTS.backup_success;
  }
  if (success === false && normalizedEvent.includes('backup')) {
    return KNOWN_EVENTS.backup_failed;
  }

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
 * Formats a Coolify webhook payload into a Bale message.
 * Defaults to Markdown (native for Bale Messenger clients), supports HTML if configured.
 *
 * @param {Record<string, any>} payload
 * @param {object} [options]
 * @param {boolean} [options.includeRawPayload=false]
 * @param {string} [options.parseMode='Markdown']
 * @returns {string}
 */
export function formatCoolifyMessage(payload, options = {}) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const includeRaw = Boolean(options.includeRawPayload ?? config.includeRawPayload);
  const parseMode = (options.parseMode || config.parseMode || 'Markdown').trim();
  const isHtml = parseMode.toLowerCase() === 'html';

  const { emoji, title } = resolveEventMeta(data.event, data.success);

  const sections = [];

  if (isHtml) {
    // HTML Header
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
  } else {
    // Markdown Header (Bale native client renderer)
    sections.push(`${emoji} *${escapeMarkdown(title)}*`);

    // Key-value metadata lines
    const metaLines = [];
    if (data.application_name) {
      metaLines.push(`*Application:* ${escapeMarkdown(data.application_name)}`);
    }
    if (data.project_name) {
      metaLines.push(`*Project:* ${escapeMarkdown(data.project_name)}`);
    }
    if (data.environment_name) {
      metaLines.push(`*Environment:* ${escapeMarkdown(data.environment_name)}`);
    }
    if (data.server_name) {
      metaLines.push(`*Server:* ${escapeMarkdown(data.server_name)}`);
    }
    if (data.server_uuid) {
      metaLines.push(`*Server UUID:* \`${escapeMarkdown(data.server_uuid)}\``);
    }
    if (data.status) {
      metaLines.push(`*Status:* ${escapeMarkdown(data.status)}`);
    }

    if (metaLines.length > 0) {
      sections.push(metaLines.join('\n'));
    }

    // Message or description body
    const bodyText = data.message || data.description;
    if (bodyText) {
      sections.push(escapeMarkdown(bodyText));
    }

    // Link / FQDN (Bale renders plain URLs automatically as clickable links)
    const targetUrl = data.fqdn || data.url;
    if (targetUrl) {
      const trimmedUrl = String(targetUrl).trim();
      sections.push(`🔗 ${trimmedUrl}`);
    }

    // Deployment UUID
    if (data.deployment_uuid) {
      sections.push(`\`${escapeMarkdown(data.deployment_uuid)}\``);
    }
  }

  let baseMessage = sections.join('\n\n').trim();

  // Handle optional raw payload
  if (includeRaw) {
    const rawJson = JSON.stringify(data, null, 2);
    if (isHtml) {
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
    } else {
      const prefix = '\n\n*Raw Payload:*\n```json\n';
      const suffix = '\n```';
      const overhead = prefix.length + suffix.length;
      const availableSpace = BALE_MAX_MESSAGE_LENGTH - baseMessage.length - overhead;

      if (availableSpace > 50) {
        if (rawJson.length > availableSpace) {
          const truncatedSnippet = rawJson.slice(0, Math.max(0, availableSpace - 20)) + '\n... (truncated)';
          baseMessage += `${prefix}${truncatedSnippet}${suffix}`;
        } else {
          baseMessage += `${prefix}${rawJson}${suffix}`;
        }
      }
    }
  }

  // Final length sanity guard for Bale/Telegram limits
  if (baseMessage.length > BALE_MAX_MESSAGE_LENGTH) {
    baseMessage = baseMessage.slice(0, BALE_MAX_MESSAGE_LENGTH - 16) + '... (truncated)';
  }

  return baseMessage;
}
