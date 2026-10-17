/** Thin fetch client. Access token lives in memory only; the refresh token is an httpOnly cookie managed by the API. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly details?: Array<{ path: string; message: string }>) { super(message); this.name = 'ApiError'; }
}

const BASE = '/api/v1';
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(token: string | null) => void>();

export const getAccessToken = () => accessToken;
export function setAccessToken(token: string | null) { accessToken = token; listeners.forEach(l => l(token)); }
export function onTokenChange(fn: (token: string | null) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function csrfToken(): string {
  // Double-submit style header; the API checks Origin plus a non-trivial header value on cookie-authenticated mutations.
  const key = 'ash_csrf';
  try {
    let value = sessionStorage.getItem(key);
    if (!value) { value = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem(key, value); }
    return value;
  } catch { return 'fallback-csrf-token-' + Math.random().toString(36).slice(2); }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken() } });
      if (!res.ok) { setAccessToken(null); return null; }
      const json = await res.json() as { data: { accessToken: string } };
      setAccessToken(json.data.accessToken);
      return json.data.accessToken;
    } catch { setAccessToken(null); return null; }
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

type Options = { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal };

export async function api<T>(path: string, options: Options = {}): Promise<{ data: T; meta?: Record<string, unknown>; pagination?: { page: number; limit: number; total: number; pages: number } }> {
  const { method = 'GET', body, auth = false, signal } = options;
  const attempt = async (token: string | null) => fetch(`${BASE}${path}`, {
    method, credentials: 'include', ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  let token = auth ? (accessToken ?? await refreshAccessToken()) : null;
  if (auth && !token) throw new ApiError(401, 'Please sign in to continue', 'UNAUTHORIZED');
  let res = await attempt(token);
  if (auth && res.status === 401) {
    token = await refreshAccessToken();
    if (!token) throw new ApiError(401, 'Your session has expired. Please sign in again.', 'UNAUTHORIZED');
    res = await attempt(token);
  }
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json().catch(() => ({})) as { data?: T; error?: string; code?: string; details?: Array<{ path: string; message: string }>; meta?: Record<string, unknown>; pagination?: { page: number; limit: number; total: number; pages: number } };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`, json.code, json.details);
  return { data: json.data as T, ...(json.meta ? { meta: json.meta } : {}), ...(json.pagination ? { pagination: json.pagination } : {}) };
}

export const formatPrice = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export type Brand = { id: string; name: string; slug: string };
export type ProductCardData = {
  id: string; name: string; slug: string; shortDescription: string | null; basePrice: number; compareAtPrice: number | null; currency: string;
  gender: 'MEN' | 'WOMEN' | 'UNISEX'; movement: string; isFeatured: boolean; inStock?: boolean;
  brand: Brand; category: { name: string; slug: string }; images: Array<{ url: string; altText: string; isPrimary: boolean }>;
  variants?: Array<{ id: string; stockQuantity: number; price: number }>;
};
export type Variant = { id: string; sku: string; name: string; strapMaterial: string; strapColor: string; dialColor: string; caseMaterial: string; caseColor: string; price: number; stockQuantity: number };
export type ProductDetail = Omit<ProductCardData, 'variants'> & {
  description: string; caseSizeMm: string | number; caseThicknessMm: string | number | null; waterResistanceM: number; crystal: string | null; powerReserveHours: number | null;
  specifications: Record<string, unknown>; tags: string[]; variants: Variant[]; models3D: Array<{ id: string; glbUrl: string }>;
  reviews: Array<{ id: string; rating: number; title: string | null; body: string; isVerified: boolean; createdAt: string; user: { firstName: string } }>;
};

/** Multipart upload (admin images). Same auth and CSRF rules as api(); Content-Type is left to the browser so the boundary is set. */
export async function apiUpload<T>(path: string, field: string, file: File): Promise<{ data: T }> {
  const send = async (token: string | null) => {
    const form = new FormData(); form.append(field, file);
    return fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form, headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  let token = accessToken ?? await refreshAccessToken();
  if (!token) throw new ApiError(401, 'Please sign in to continue', 'UNAUTHORIZED');
  let res = await send(token);
  if (res.status === 401) { token = await refreshAccessToken(); if (!token) throw new ApiError(401, 'Your session has expired. Please sign in again.', 'UNAUTHORIZED'); res = await send(token); }
  const json = await res.json().catch(() => ({})) as { data?: T; error?: string; code?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Upload failed (${res.status})`, json.code);
  return { data: json.data as T };
}
