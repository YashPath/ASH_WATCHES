// SECURITY-CRITICAL
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AuthService } from './auth.service.js';
import { env, isProduction } from '../../config/env.js';
import { loginIpLimiter, loginLimiter, logoutLimiter, mfaChallengeLimiter, mfaConfirmLimiter, mfaEnrollLimiter, mfaInitialConfirmLimiter, mfaInitialEnrollLimiter, passwordResetConfirmLimiter, passwordResetEmailLimiter, passwordResetRequestLimiter, refreshLimiter, registerLimiter, resendVerificationEmailLimiter, resendVerificationLimiter, verifyEmailLimiter } from '../../middleware/security.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const service = new AuthService();
const registerSchema = z.object({ email: z.string().email().max(320), password: z.string().min(12).max(128), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100) });
const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) });
const cookieOptions = { httpOnly: true, secure: isProduction || env.COOKIE_SECURE === 'true', sameSite: env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none', path: '/api/v1/auth', maxAge: 30 * 86400_000 };
const noStore = (res: import('express').Response) => res.setHeader('Cache-Control', 'no-store, private');
router.post('/register', registerLimiter, async (req, res, next) => { try { res.status(201).json({ data: await service.register(registerSchema.parse(req.body)) }); } catch (e) { next(e); } });
router.post('/resend-verification', resendVerificationLimiter, resendVerificationEmailLimiter, async (req, res, next) => { try { const { email } = z.object({ email: z.string().email().max(320) }).parse(req.body); noStore(res); res.json({ data: await service.resendVerification(email) }); } catch (e) { next(e); } });
router.post('/verify-email', verifyEmailLimiter, async (req, res, next) => { try { const { token } = z.object({ token: z.string().min(32).max(200) }).parse(req.body); noStore(res); res.json({ data: await service.verifyEmail(token) }); } catch (e) { next(e); } });
router.post('/password-reset/request', passwordResetRequestLimiter, passwordResetEmailLimiter, async (req, res, next) => { try { const { email } = z.object({ email: z.string().email().max(320) }).parse(req.body); noStore(res); res.json({ data: await service.requestPasswordReset(email) }); } catch (e) { next(e); } });
router.post('/password-reset/confirm', passwordResetConfirmLimiter, async (req, res, next) => { try { const { token, password } = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(128) }).parse(req.body); noStore(res); res.json({ data: await service.resetPassword(token, password) }); } catch (e) { next(e); } });
router.post('/login', loginIpLimiter, loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await service.login({ ...body, ip: req.ip, userAgent: req.get('user-agent') });
    noStore(res);
    if ('mfaRequired' in result || 'mfaEnrollmentRequired' in result) return res.json({ data: result });
    res.cookie(env.COOKIE_NAME, result.refreshToken, cookieOptions);
    const { refreshToken: _refreshToken, ...safe } = result;
    res.json({ data: safe });
  } catch (e) { next(e); }
});
router.post('/mfa/challenge', mfaChallengeLimiter, async (req, res, next) => {
  try {
    const { challengeToken, code } = z.object({ challengeToken: z.string().min(20), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const result = await service.completeMfa(challengeToken, code, req.ip, req.get('user-agent'));
    res.cookie(env.COOKIE_NAME, result.refreshToken, cookieOptions);
    const { refreshToken: _refreshToken, ...safe } = result;
    noStore(res); res.json({ data: safe });
  } catch (e) { next(e); }
});
router.post('/mfa/enroll/initial', mfaInitialEnrollLimiter, async (req, res, next) => { try { const { enrollmentToken } = z.object({ enrollmentToken: z.string().min(32).max(200) }).parse(req.body); noStore(res); res.json({ data: await service.beginAdminTotpEnrollment(enrollmentToken) }); } catch (e) { next(e); } });
router.post('/mfa/confirm-initial', mfaInitialConfirmLimiter, async (req, res, next) => { try { const { enrollmentToken, code } = z.object({ enrollmentToken: z.string().min(32).max(200), code: z.string().regex(/^\d{6}$/) }).parse(req.body); noStore(res); res.json({ data: await service.confirmInitialTotp(enrollmentToken, code) }); } catch (e) { next(e); } });
router.post('/mfa/enroll', authenticate, mfaEnrollLimiter, async (req, res, next) => { try { const { password, currentCode } = z.object({ password: z.string().min(1).max(128).optional(), currentCode: z.string().regex(/^\d{6}$/).optional() }).parse(req.body); noStore(res); res.json({ data: await service.enrollTotp(req.auth!.userId, password, currentCode) }); } catch (e) { next(e); } });
router.post('/mfa/confirm', authenticate, mfaConfirmLimiter, async (req, res, next) => { try { const { code, password, currentCode } = z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().min(1).max(128).optional(), currentCode: z.string().regex(/^\d{6}$/).optional() }).parse(req.body); noStore(res); res.json({ data: await service.confirmTotp(req.auth!.userId, code, password, currentCode) }); } catch (e) { next(e); } });
router.post('/refresh', refreshLimiter, async (req, res, next) => { try { const raw = req.cookies?.[env.COOKIE_NAME]; if (typeof raw !== 'string') return res.status(401).json({ error: 'Refresh session required' }); const result = await service.refresh(raw, req.ip, req.get('user-agent')); res.cookie(env.COOKIE_NAME, result.refreshToken, cookieOptions); noStore(res); res.json({ data: { accessToken: result.accessToken } }); } catch (e) { next(e); } });
router.get('/me', authenticate, async (req, res, next) => { try { const user = await prisma.user.findFirst({ where: { id: req.auth!.userId, deletedAt: null }, select: { id: true, email: true, firstName: true, lastName: true, role: true, emailVerifiedAt: true, twoFactorEnabled: true } }); if (!user) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' }); noStore(res); const { emailVerifiedAt, ...rest } = user; res.json({ data: { ...rest, emailVerified: Boolean(emailVerifiedAt) } }); } catch (e) { next(e); } });
router.post('/logout', logoutLimiter, async (req, res, next) => { try { await service.logout(req.cookies?.[env.COOKIE_NAME]); res.clearCookie(env.COOKIE_NAME, { ...cookieOptions, maxAge: undefined }); res.status(204).end(); } catch (e) { next(e); } });
export default router;
