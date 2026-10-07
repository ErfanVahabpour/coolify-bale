import crypto from 'node:crypto';

/**
 * Performs a timing-safe comparison of two strings using SHA-256 digests.
 * This guarantees constant-time evaluation and avoids length leakage.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Validates request credentials against the expected webhook secret.
 * Supports:
 *   1. Authorization: Bearer <secret> (standard header)
 *   2. Query parameter: ?token=<secret> or ?secret=<secret> (for webhook callers without custom header support)
 *
 * @param {string | undefined} authHeader
 * @param {string} expectedSecret
 * @param {string | undefined} [queryToken]
 * @returns {boolean}
 */
export function authenticateRequest(authHeader, expectedSecret, queryToken = undefined) {
  // 1. Check Authorization: Bearer <token>
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    const spaceIndex = trimmed.indexOf(' ');

    if (spaceIndex !== -1) {
      const scheme = trimmed.slice(0, spaceIndex);
      const token = trimmed.slice(spaceIndex + 1).trim();

      if (scheme.toLowerCase() === 'bearer' && token) {
        if (timingSafeCompare(token, expectedSecret)) {
          return true;
        }
      }
    }
  }

  // 2. Check query parameter fallback (?token=... or ?secret=...)
  if (queryToken && typeof queryToken === 'string') {
    if (timingSafeCompare(queryToken.trim(), expectedSecret)) {
      return true;
    }
  }

  return false;
}
