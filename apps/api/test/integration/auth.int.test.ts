import { beforeEach, describe, expect, it } from 'vitest';
import { API, app, createUser, csrfHeaders, customer, loginAs, prisma, request, resetDatabase, PASSWORD } from './helpers.js';
import { env } from '../../src/config/env.js';

const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined)?.find(c => c.startsWith(`${env.COOKIE_NAME}=`));

describe('auth', () => {
  beforeEach(resetDatabase);

  it('registers without leaking whether the email exists', async () => {
    const body = { email: 'new@example.com', password: PASSWORD, firstName: 'New', lastName: 'User' };
    const first = await request(app).post(`${API}/auth/register`).set(csrfHeaders).send(body);
    const second = await request(app).post(`${API}/auth/register`).set(csrfHeaders).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await prisma.user.count({ where: { email: 'new@example.com' } })).toBe(1);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post(`${API}/auth/register`).set(csrfHeaders).send({ email: 'a@example.com', password: 'short', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
  });

  it('logs in, sets an httpOnly refresh cookie and never returns the refresh token in the body', async () => {
    const { email } = await createUser();
    const res = await loginAs(email);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('refreshToken');
    const cookie = cookieOf(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('gives the same generic error for wrong password and unknown user', async () => {
    const { email } = await createUser();
    const wrong = await loginAs(email, 'Wrong-Password-123!');
    const unknown = await loginAs('nobody@example.com');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('locks the account after repeated failures', async () => {
    const { email } = await createUser();
    for (let i = 0; i < 6; i++) await loginAs(email, 'Wrong-Password-123!');
    const res = await loginAs(email); // correct password, but locked
    expect(res.status).toBe(401);
  });

  it('/me requires a token and returns the profile', async () => {
    expect((await request(app).get(`${API}/auth/me`)).status).toBe(401);
    const c = await customer();
    const me = await request(app).get(`${API}/auth/me`).set(c.auth);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: c.email, role: 'CUSTOMER', emailVerified: true });
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { email } = await createUser();
    const login = await loginAs(email);
    const cookie1 = cookieOf(login)!.split(';')[0]!;
    const r1 = await request(app).post(`${API}/auth/refresh`).set(csrfHeaders).set('Cookie', cookie1);
    expect(r1.status).toBe(200);
    const cookie2 = cookieOf(r1)!.split(';')[0]!;
    expect(cookie2).not.toBe(cookie1);
    // Replaying the old token after the grace window must kill the whole family.
    await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 120_000) } });
    const replay = await request(app).post(`${API}/auth/refresh`).set(csrfHeaders).set('Cookie', cookie1);
    expect(replay.status).toBe(401);
    const afterReuse = await request(app).post(`${API}/auth/refresh`).set(csrfHeaders).set('Cookie', cookie2);
    expect(afterReuse.status).toBe(401);
  });

  it('requires CSRF headers for cookie-authenticated mutations', async () => {
    const { email } = await createUser();
    const login = await loginAs(email);
    const cookie = cookieOf(login)!.split(';')[0]!;
    const noHeader = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(noHeader.status).toBe(403);
    const wrongOrigin = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).set({ Origin: 'https://evil.example', 'X-CSRF-Token': 'x'.repeat(32) });
    expect(wrongOrigin.status).toBe(403);
  });

  it('logout revokes the refresh token', async () => {
    const { email } = await createUser();
    const login = await loginAs(email);
    const cookie = cookieOf(login)!.split(';')[0]!;
    const out = await request(app).post(`${API}/auth/logout`).set(csrfHeaders).set('Cookie', cookie);
    expect(out.status).toBe(204);
    const refresh = await request(app).post(`${API}/auth/refresh`).set(csrfHeaders).set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('admins cannot sign in without MFA enrolment', async () => {
    const { email } = await createUser({ role: 'ADMIN' });
    const res = await loginAs(email);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.mfaEnrollmentRequired || res.body.data.mfaRequired).toBeTruthy();
  });
});
