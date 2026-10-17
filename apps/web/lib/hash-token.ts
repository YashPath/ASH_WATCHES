'use client';
/**
 * Email action links carry their one-time token in the URL fragment (#token=...), which browsers never send to servers or logs.
 * Read it once on mount, then scrub it from the address bar and history.
 */
export function readHashToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  const token = fromHash ?? new URLSearchParams(window.location.search).get('token');
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token && token.length >= 32 && token.length <= 200 ? token : null;
}
