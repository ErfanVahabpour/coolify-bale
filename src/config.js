import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

/**
 * Parses boolean environment variables safely.
 * @param {string | undefined} val
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function parseBoolean(val, defaultValue) {
  if (val === undefined || val === null || val === '') {
    return defaultValue;
  }
  const normalized = String(val).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

/**
 * Validates and loads webhook configurations from the WEBHOOKS environment variable.
 * @param {string | undefined} rawJson
 * @returns {Map<string, { id: string, secret: string, baleBotToken: string, baleChatId: string }>}
 */
export function loadWebhooks(rawJson = process.env.WEBHOOKS) {
  if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) {
    throw new Error('Environment variable WEBHOOKS is required and cannot be empty.');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Invalid JSON syntax in WEBHOOKS environment variable: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('WEBHOOKS environment variable must be a JSON array of webhook configuration objects.');
  }

  if (parsed.length === 0) {
    throw new Error('WEBHOOKS array must contain at least one webhook configuration.');
  }

  const webhookMap = new Map();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const index = i + 1;

    if (!item || typeof item !== 'object') {
      throw new Error(`Webhook #${index} is not an object.`);
    }

    const { id, secret, baleBotToken, baleChatId } = item;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new Error(`Webhook #${index} is missing a valid 'id' string.`);
    }

    const trimmedId = id.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
      throw new Error(`Webhook #${index} 'id' ("${trimmedId}") must contain only letters, numbers, hyphens, and underscores.`);
    }

    if (webhookMap.has(trimmedId)) {
      throw new Error(`Duplicate webhook id found: "${trimmedId}". Each webhook id must be unique.`);
    }

    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error(`Webhook "${trimmedId}" is missing a valid 'secret' string.`);
    }

    if (!baleBotToken || typeof baleBotToken !== 'string' || !baleBotToken.trim()) {
      throw new Error(`Webhook "${trimmedId}" is missing a valid 'baleBotToken' string.`);
    }

    if (baleChatId === undefined || baleChatId === null || String(baleChatId).trim() === '') {
      throw new Error(`Webhook "${trimmedId}" is missing a valid 'baleChatId'.`);
    }

    webhookMap.set(trimmedId, {
      id: trimmedId,
      secret: secret.trim(),
      baleBotToken: baleBotToken.trim(),
      baleChatId: String(baleChatId).trim(),
    });
  }

  return webhookMap;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  logRequests: parseBoolean(process.env.LOG_REQUESTS, true),
  includeRawPayload: parseBoolean(process.env.INCLUDE_RAW_PAYLOAD, false),
  disableLinkPreviews: parseBoolean(process.env.DISABLE_LINK_PREVIEWS, true),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  baleApiBaseUrl: (process.env.BALE_API_BASE_URL || 'https://tapi.bale.ai').replace(/\/+$/, ''),
  baleRequestTimeoutMs: parseInt(process.env.BALE_REQUEST_TIMEOUT_MS || '10000', 10),
};
