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
 * Strips HTML tags for graceful fallback if Bale fails to parse HTML entities.
 * @param {string} htmlText
 * @returns {string}
 */
function stripHtmlTags(htmlText) {
  return htmlText
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
 * Implements graceful fallback if optional parameters (like disable_web_page_preview or HTML entities)
 * are rejected by Bale's API parser.
 *
 * @param {object} params
 * @param {string} params.botToken - Bale bot token
 * @param {string} params.chatId - Target Bale chat ID
 * @param {string} params.text - HTML-formatted message
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
    parse_mode: 'HTML',
  };

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
        // Continue to HTML fallback below if needed
      }
    }

    // If 400 Bad Request indicates entity/HTML parse error, retry as plain text
    if (err.status === 400 && payload.parse_mode === 'HTML') {
      const plainTextPayload = {
        chat_id: payload.chat_id,
        text: stripHtmlTags(payload.text),
      };
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
