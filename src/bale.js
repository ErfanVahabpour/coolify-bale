import { config } from './config.js';

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
 * Custom Error for Bale Bot API failures.
 */
export class BaleApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=502]
   * @param {any} [responseBody=null]
   */
  constructor(message, statusCode = 502, responseBody = null) {
    super(redactSensitive(message));
    this.name = 'BaleApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
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
 * Low-level HTTP POST request to Bale API with timeout.
 * @param {string} url
 * @param {object} payload
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'coolify-bale-bridge/1.0.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      data = { text };
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new BaleApiError(`Request to Bale API timed out after ${timeoutMs}ms`, 504);
    }
    throw new BaleApiError(`Network failure connecting to Bale API: ${err.message}`, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends a notification message to a Bale chat.
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
 * @returns {Promise<any>} Bale API response
 */
export function sendToBale(params) {
  const {
    botToken,
    chatId,
    text,
    disableLinkPreviews = config.disableLinkPreviews,
    baseUrl = config.baleApiBaseUrl,
    timeoutMs = config.baleRequestTimeoutMs,
  } = params;

  if (!botToken || typeof botToken !== 'string') {
    throw new BaleApiError('Missing or invalid Bale bot token', 500);
  }

  if (!chatId) {
    throw new BaleApiError('Missing or invalid Bale chat ID', 500);
  }

  const endpointUrl = `${baseUrl}/bot${botToken}/sendMessage`;

  // Construct initial payload
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };

  if (disableLinkPreviews) {
    // Standard Telegram/Bale parameter for link preview suppression
    payload.disable_web_page_preview = true;
  }

  return executeWithFallbacks(endpointUrl, payload, timeoutMs);
}

/**
 * Executes the sendMessage request with resilience against parameter incompatibility.
 * @param {string} endpointUrl
 * @param {object} payload
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function executeWithFallbacks(endpointUrl, payload, timeoutMs) {
  // Attempt 1: Standard request
  const attempt1 = await postJson(endpointUrl, payload, timeoutMs);

  if (attempt1.ok && (attempt1.data?.ok !== false)) {
    return attempt1.data;
  }

  const errorMessage = attempt1.data?.description || attempt1.data?.error || `HTTP ${attempt1.status}`;

  // If 400 Bad Request occurred and disable_web_page_preview was included, retry without it
  if (attempt1.status === 400 && payload.disable_web_page_preview) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.disable_web_page_preview;

    const attempt2 = await postJson(endpointUrl, fallbackPayload, timeoutMs);
    if (attempt2.ok && (attempt2.data?.ok !== false)) {
      return attempt2.data;
    }
  }

  // If 400 Bad Request indicates entity/HTML parse error, retry as plain text
  if (attempt1.status === 400 && payload.parse_mode === 'HTML') {
    const plainTextPayload = {
      chat_id: payload.chat_id,
      text: stripHtmlTags(payload.text),
    };

    const attempt3 = await postJson(endpointUrl, plainTextPayload, timeoutMs);
    if (attempt3.ok && (attempt3.data?.ok !== false)) {
      return attempt3.data;
    }
  }

  // All attempts exhausted
  throw new BaleApiError(`Bale API rejected message: ${errorMessage}`, attempt1.status, attempt1.data);
}
