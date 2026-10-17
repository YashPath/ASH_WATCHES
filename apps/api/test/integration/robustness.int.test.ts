import { describe, expect, it } from 'vitest';
import { API, app, csrfHeaders, request } from './helpers.js';

describe('request robustness', () => {
  it('malformed JSON is a 400 without internals', async () => {
    const res = await request(app).post(`${API}/auth/login`).set(csrfHeaders).set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.text).not.toMatch(/\.(ts|js):\d+/);
  });
  it('an oversized JSON body is a 413', async () => {
    const res = await request(app).post(`${API}/auth/login`).set(csrfHeaders).set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(2_000_000) }));
    expect(res.status).toBe(413);
  });
  it('unknown routes return JSON 404', async () => {
    const res = await request(app).get(`${API}/definitely-not-here`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
