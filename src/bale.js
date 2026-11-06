import { BaleBot, BaleApiError } from '@erfanvahabpour/bale-bot-sdk';
import { config } from './config.js';

export { BaleApiError };

/**
 * Redacts bot tokens and sensitive patterns from error messages, URLs, or objects.
 * @param {any} input
 * @returns {string}
 */
export function redactSensitive(input) {
  if (input === null || input === undefined) {
    return '';
  }
  const str = typeof input === 'string' ? input : String(input);
  return str.replace(/bot[A-Za-z0-9_:-]+/g, 'bot[REDACTED]');
}

/**
 * Strips HTML tags and Markdown formatting for graceful fallback if Bale fails to parse entities.
 * @param {string} text
 * @returns {string}
 */
export function stripFormatting(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\\([*`_\[\]])/g, '$1')
    .replace(/[*`_]/g, '');
}

/**
 * Finds distinct HTTP(S) URLs in a formatted message and turns them into
 * inline keyboard buttons. Markdown and HTML links are both covered, as are
 * plain URLs included in message text or the optional raw payload.
 * @param {string} text
 * @returns {{ inline_keyboard: Array<Array<{text: string, url: string}>> }|undefined}
 */
export function createUrlReplyMarkup(text) {
  const urls = new Set();
  const message = String(text || '');
  const markdownLinkTargets = [...message.matchAll(/\]\((https?:\/\/[^)\s]+)\)/gi)].map(match => match[1]);
  const plainUrls = message.match(/https?:\/\/[^\s<>"'`\])}]+/gi) || [];
  const matches = [...markdownLinkTargets, ...plainUrls];

  for (const match of matches) {
    let candidate = match
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
    candidate = candidate.replace(/[.,!?;:]+$/g, '');
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        urls.add(parsed.href);
      }
    } catch {
      // Ignore malformed URL-like text.
    }
  }

  if (urls.size === 0) return undefined;

  const normalizedMessage = message.toLowerCase();
  const inferLabel = url => {
    const path = new URL(url).pathname.toLowerCase();
    if (/\/server(?:\/|$)/.test(path) || normalizedMessage.includes('server unreachable') || normalizedMessage.includes('server reachable')) {
      return 'Open Server';
    }
    if (/\/backup(?:\/|$)/.test(path) || normalizedMessage.includes('backup')) {
      return 'Open Backup';
    }
    if (/\/project(?:\/|$)/.test(path)) return 'Open Project';
    if (/\/application(?:\/|$)/.test(path) || normalizedMessage.includes('deployment') || normalizedMessage.includes('application:')) {
      return 'Open Application';
    }
    if (/\/environment(?:\/|$)/.test(path)) return 'Open Environment';
    return 'Open Link';
  };

  return {
    inline_keyboard: [...urls].map(url => {
      return [{ text: inferLabel(url), url }];
    }),
  };
}

/**
 * Normalizes base URL so it matches BaleBot's requirement of ending in /bot.
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
  const trimmed = (url || 'https://tapi.bale.ai').replace(/\/+$/, '');
  return trimmed.endsWith('/bot') ? trimmed : `${trimmed}/bot`;
}

// Bot instance cache by token and baseUrl
const botPool = new Map();

/**
 * Retrieves or creates a cached BaleBot instance from @erfanvahabpour/bale-bot-sdk.
 * @param {string} token
 * @param {string} [baseUrl]
 * @param {number} [timeoutMs]
 * @returns {BaleBot}
 */
export function getBaleBot(token, baseUrl = config.baleApiBaseUrl, timeoutMs = config.baleRequestTimeoutMs) {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const cacheKey = `${normalizedUrl}:${token}:${timeoutMs}`;
  let bot = botPool.get(cacheKey);
  if (!bot) {
    bot = new BaleBot({
      token,
      baseUrl: normalizedUrl,
      timeout: timeoutMs,
    });
    botPool.set(cacheKey, bot);
  }
  return bot;
}

/**
 * Sends a notification message to a Bale chat using @erfanvahabpour/bale-bot-sdk.
 * Implements graceful fallback if optional parameters (like disable_web_page_preview or formatting)
 * are rejected by Bale's API parser.
 *
 * @param {object} params
 * @param {string} params.botToken - Bale bot token
 * @param {string} params.chatId - Target Bale chat ID
 * @param {string} params.text - Formatted message
 * @param {string} [params.parseMode] - Parse mode ('Markdown' or 'HTML')
 * @param {boolean} [params.disableLinkPreviews=true] - Whether to disable link previews
 * @param {string} [params.baseUrl] - Optional Bale API base URL override
 * @param {number} [params.timeoutMs] - Request timeout in milliseconds
 * @returns {Promise<any>}
 */
export async function sendToBale(params) {
  const {
    botToken,
    chatId,
    text,
    parseMode = config.parseMode,
    disableLinkPreviews = config.disableLinkPreviews,
    baseUrl = config.baleApiBaseUrl,
    timeoutMs = config.baleRequestTimeoutMs,
  } = params;

  if (!botToken || typeof botToken !== 'string') {
    throw new BaleApiError('Missing or invalid Bale bot token', { status: 500 });
  }

  if (!chatId) {
    throw new BaleApiError('Missing or invalid Bale chat ID', { status: 500 });
  }

  const bot = getBaleBot(botToken, baseUrl, timeoutMs);

  const payload = {
    chat_id: chatId,
    text,
  };

  const replyMarkup = createUrlReplyMarkup(text);
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  if (parseMode) {
    payload.parse_mode = parseMode;
  }

  if (disableLinkPreviews) {
    payload.disable_web_page_preview = true;
  }

  // Attempt 1: Standard request with parse_mode and preview setting
  try {
    return await bot.call('sendMessage', payload);
  } catch (err) {
    // If 400 Bad Request occurred and disable_web_page_preview was included, retry without it
    if (err.status === 400 && payload.disable_web_page_preview) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.disable_web_page_preview;
      try {
        return await bot.call('sendMessage', fallbackPayload);
      } catch (retryErr) {
        // Continue to formatting fallback below if needed
      }
    }

    // If 400 Bad Request indicates entity/formatting parse error, retry as plain text
    if (err.status === 400 && payload.parse_mode) {
      const plainTextPayload = {
        chat_id: payload.chat_id,
        text: stripFormatting(payload.text),
      };
      if (payload.reply_markup) {
        plainTextPayload.reply_markup = payload.reply_markup;
      }
      try {
        return await bot.call('sendMessage', plainTextPayload);
      } catch {
        // Fall through to throw sanitized error below
      }
    }

    // Re-throw sanitized error without token leakage
    const sanitizedMsg = redactSensitive(err.description || err.message || 'Bale API rejected message');
    const apiError = new BaleApiError(sanitizedMsg, { status: err.status || 502, cause: err });
    apiError.statusCode = err.status || 502;
    throw apiError;
  }
}
