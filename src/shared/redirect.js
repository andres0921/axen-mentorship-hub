// Pure redirect helpers (no Supabase import, so they're unit-testable).
import { MENTEE_PORTAL_PATH, MENTOR_APP_PATH } from './config.js';

export function homePathForRole(role) {
  if (role === 'mentee') return MENTEE_PORTAL_PATH;
  if (role === 'mentor' || role === 'admin') return MENTOR_APP_PATH;
  return null;
}

// Sanitise a post-login `next` value. Only same-origin RELATIVE paths are
// allowed (prevents open redirects such as //evil.com, /\evil.com,
// https://evil.com, javascript:…, or "/\t/evil.com", which browsers normalise
// to //evil.com). Returns the normalised path+search+hash, or null.
export function sanitizeNext(next) {
  if (typeof next !== 'string') return null;
  if (next.length === 0 || next.length > 512) return null;
  if (next[0] !== '/' || next[1] === '/' || next.includes('\\')) return null;
  // control characters (incl. tab/newline), spaces, DEL
  if (/[\u0000- \u007f]/.test(next)) return null;
  const base = 'https://app.invalid';
  let url;
  try {
    url = new URL(next, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  // never bounce back into the confirm page itself
  if (/^\/auth\/confirm(\/|$)/.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

// Where to send a signed-in user after confirming an email link. `next` is
// honoured only when it's safe AND inside the app for that role; otherwise the
// role's home. Returns null for roles with no app access (pending).
export function destinationFor(role, next) {
  const home = homePathForRole(role);
  if (!home) return null;
  const safe = sanitizeNext(next);
  if (!safe) return home;
  const inMentee = safe === '/mentee' || safe.startsWith('/mentee/') || safe.startsWith('/mentee?') || safe.startsWith('/mentee#');
  if (role === 'mentee') return inMentee ? safe : home;
  return inMentee ? home : safe;
}

// verifyOtp types the confirm page accepts. 'recovery' is deliberately absent:
// there is no set-new-password screen, so a recovery link must not silently
// sign someone in.
export const CONFIRM_TYPES = Object.freeze(['invite', 'magiclink', 'email', 'signup', 'email_change']);
