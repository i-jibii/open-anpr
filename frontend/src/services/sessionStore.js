/**
 * sessionStore.js
 *
 * Manages the anonymous session ID stored in localStorage.
 * When a user first visits the site, a random UUID is generated
 * and persisted. All API calls include this ID via X-Session-ID header
 * so the backend can scope all data to this browser session.
 */

const SESSION_KEY = 'openanpr_session_id';

/**
 * Returns the current session ID.
 * If none exists yet, generates a new UUID and stores it.
 */
export function getSessionId() {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = generateUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

/**
 * Force-reset the session (clears all local data).
 * After calling this, the next getSessionId() will create a fresh session.
 */
export function resetSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Generates a RFC4122 v4 UUID using the browser's crypto API.
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
