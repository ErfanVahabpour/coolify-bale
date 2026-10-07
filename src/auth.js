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
 * Validates the Authorization header against the expected webhook secret.
 * Requires: Authorization: Bearer <secret>
 * Does NOT accept secrets from URL parameters or request body.
 *
 * @param {string | undefined} authHeader
 * @param {string} expectedSecret
 * @returns {boolean}
 */
export function authenticateRequest(authHeader, expectedSecret) {
  if (!authHeader || typeof authHeader !== 'string') {
    return false;
  }

  const trimmed = authHeader.trim();
  const spaceIndex = trimmed.indexOf(' ');

  if (spaceIndex === -1) {
    return false;
  }

  const scheme = trimmed.slice(0, spaceIndex);
  const token = trimmed.slice(spaceIndex + 1).trim();

  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return false;
  }

  return timingSafeCompare(token, expectedSecret);
}
