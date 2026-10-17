// SECURITY-CRITICAL
import argon2 from 'argon2';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../lib/errors.js';
import { queueActionEmail } from '../../lib/email.js';
import { rateLimitRedis } from '../../middleware/security.js';
import { decryptTotpSecret, encryptTotpSecret } from '../../lib/totp-crypto.js';

const ACCESS_SECONDS = 15 * 60;
const REFRESH_DAYS = 30;
const REUSE_GRACE_MS = 20_000;
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/;
authenticator.options = { step: 30, window: 0 };

async function breachedPassword(password: string): Promise<boolean> {
  if (env.HIBP_ENABLED !== 'true') return false;
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5); const suffix = hash.slice(5);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), env.HIBP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' }, signal: controller.signal });
    if (!response.ok) throw new AppError(503, 'Password breach service unavailable; try again', 'HIBP_UNAVAILABLE');
    return (await response.text()).split('\n').some(line => line.split(':')[0]?.trim().toUpperCase() === suffix);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new AppError(503, 'Password breach service timed out; try again', 'HIBP_UNAVAILABLE');
    throw error;
  } finally { clearTimeout(timer); }
}
function issueAccess(user: { id: string; role: UserRole }, mfa = false) {
  return jwt.sign({ role: user.role, typ: 'access', mfa }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: user.id, expiresIn: ACCESS_SECONDS, jwtid: crypto.randomUUID(), issuer: 'ash-api', audience: 'ash-web' });
}
function opaqueToken() { return crypto.randomBytes(48).toString('base64url'); }
function tokenHash(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function genericAuthError() { return unauthorized('Invalid email or password'); }
function timeStep() { return BigInt(Math.floor(Date.now() / 30_000)); }
async function findActionToken(raw: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'ADMIN_MFA_ENROLL') {
  const token = await prisma.emailActionToken.findUnique({ where: { tokenHash: tokenHash(raw) } });
  if (!token || token.type !== type || token.usedAt || token.expiresAt <= new Date()) throw new AppError(400, 'Action token is invalid or expired', 'INVALID_ACTION_TOKEN');
  return token;
}
async function issueChallenge(userId: string) {
  const jti = crypto.randomUUID();
  const stored = await rateLimitRedis.set(`mfa:challenge:${jti}`, userId, 'EX', 300, 'NX');
  if (stored !== 'OK') throw new Error('Unable to persist single-use MFA challenge');
  return jwt.sign({ typ: 'mfa-challenge' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: userId, jwtid: jti, expiresIn: '5m', issuer: 'ash-api', audience: 'ash-web' });
}

export class AuthService {
  async register(input: { email: string; password: string; firstName: string; lastName: string }) {
    const email = input.email.trim().toLowerCase();
    if (!PASSWORD_POLICY.test(input.password)) throw new AppError(400, 'Password must be 12–128 characters and include lowercase, uppercase, number, and symbol', 'WEAK_PASSWORD');
    if (await breachedPassword(input.password)) throw new AppError(400, 'Choose a password not found in known data breaches', 'BREACHED_PASSWORD');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    try {
      const user = await prisma.$transaction(async tx => { const created = await tx.user.create({ data: { email, passwordHash, firstName: input.firstName.trim(), lastName: input.lastName.trim() } }); await tx.cart.create({ data: { userId: created.id } }); return created; });
      await queueActionEmail(user.email, 'VERIFY_EMAIL');
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return { message: 'If registration can be completed, verification instructions will be sent.' };
      throw error;
    }
    return { message: 'If registration can be completed, verification instructions will be sent.' };
  }

  async resendVerification(emailInput: string) {
    await queueActionEmail(emailInput, 'VERIFY_EMAIL');
    return { message: 'If the account exists and needs verification, instructions will be sent.' };
  }

  async verifyEmail(rawToken: string) {
    const token = await findActionToken(rawToken, 'VERIFY_EMAIL');
    await prisma.$transaction(async tx => {
      const used = await tx.emailActionToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError(400, 'Verification token is invalid or expired', 'INVALID_ACTION_TOKEN');
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
    });
    return { verified: true };
  }

  async requestPasswordReset(emailInput: string) {
    await queueActionEmail(emailInput, 'RESET_PASSWORD');
    return { message: 'If the account exists, password reset instructions will be sent.' };
  }

  async resetPassword(rawToken: string, password: string) {
    if (!PASSWORD_POLICY.test(password)) throw new AppError(400, 'Password must be 12–128 characters and include lowercase, uppercase, number, and symbol', 'WEAK_PASSWORD');
    if (await breachedPassword(password)) throw new AppError(400, 'Choose a password not found in known data breaches', 'BREACHED_PASSWORD');
    const token = await findActionToken(rawToken, 'RESET_PASSWORD');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await prisma.$transaction(async tx => {
      const used = await tx.emailActionToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError(400, 'Reset token is invalid or expired', 'INVALID_ACTION_TOKEN');
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null, totpFailureCount: 0, totpLockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { reset: true };
  }

  async login(input: { email: string; password: string; ip?: string; userAgent?: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) { await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); throw genericAuthError(); }
    if (user.lockedUntil && user.lockedUntil > new Date()) { await argon2.verify(user.passwordHash, input.password).catch(() => false); throw genericAuthError(); }
    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      const current = await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: { increment: 1 } }, select: { failedLoginAttempts: true } });
      const delaySeconds = Math.min(3600, 2 ** Math.min(current.failedLoginAttempts, 12));
      if (current.failedLoginAttempts >= 5) await prisma.user.updateMany({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + delaySeconds * 1000) } });
      throw genericAuthError();
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    if (user.role !== UserRole.CUSTOMER && !user.twoFactorEnabled) {
      if (!user.emailVerifiedAt) throw genericAuthError();
      await queueActionEmail(user.email, 'ADMIN_MFA_ENROLL');
      return { mfaEnrollmentRequired: true, message: 'Administrator MFA setup instructions have been sent to the verified email address.' };
    }
    if (user.twoFactorEnabled) return { mfaRequired: true, challengeToken: await issueChallenge(user.id) };
    return this.issueSession(user, input.ip, input.userAgent, false);
  }

  private async verifyTotp(user: { id: string; twoFactorSecret: string | null; totpFailureCount: number; totpLockedUntil: Date | null; lastTotpTimeStep: bigint | null }, code: string) {
    if (user.totpLockedUntil && user.totpLockedUntil > new Date()) throw genericAuthError();
    const secret = user.twoFactorSecret ? decryptTotpSecret(user.twoFactorSecret) : null;
    const valid = Boolean(secret && authenticator.check(code, secret));
    if (!valid) {
      const current = await prisma.user.update({ where: { id: user.id }, data: { totpFailureCount: { increment: 1 } }, select: { totpFailureCount: true } });
      if (current.totpFailureCount >= 5) await prisma.user.updateMany({ where: { id: user.id }, data: { totpLockedUntil: new Date(Date.now() + Math.min(3600_000, 2 ** Math.min(current.totpFailureCount, 12) * 1000) ) } });
      throw genericAuthError();
    }
    const step = timeStep();
    if (user.lastTotpTimeStep !== null && step <= user.lastTotpTimeStep) throw new AppError(400, 'Authenticator code has already been used', 'TOTP_REPLAY_REJECTED');
    const saved = await prisma.user.updateMany({ where: { id: user.id, OR: [{ lastTotpTimeStep: null }, { lastTotpTimeStep: { lt: step } }] }, data: { lastTotpTimeStep: step, totpFailureCount: 0, totpLockedUntil: null } });
    if (saved.count !== 1) throw new AppError(400, 'Authenticator code has already been used', 'TOTP_REPLAY_REJECTED');
  }

  async completeMfa(challengeToken: string, code: string, ip?: string, userAgent?: string) {
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(challengeToken, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'ash-api', audience: 'ash-web' }) as jwt.JwtPayload; } catch { throw genericAuthError(); }
    if (claims.typ !== 'mfa-challenge' || !claims.sub || !claims.jti) throw genericAuthError();
    const user = await prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) throw genericAuthError();
    await this.verifyTotp(user, code);
    const consumed = await rateLimitRedis.getdel(`mfa:challenge:${claims.jti}`);
    if (consumed !== user.id) throw genericAuthError();
    return this.issueSession(user, ip, userAgent, true);
  }

  async beginAdminTotpEnrollment(enrollmentToken: string) {
    const token = await findActionToken(enrollmentToken, 'ADMIN_MFA_ENROLL');
    const user = await prisma.user.findFirst({ where: { id: token.userId, deletedAt: null } });
    if (!user || user.role === UserRole.CUSTOMER || !user.emailVerifiedAt || user.twoFactorEnabled) throw genericAuthError();
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { pendingTwoFactorSecret: encryptTotpSecret(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, env.TOTP_ISSUER, secret) };
  }
  async confirmInitialTotp(enrollmentToken: string, code: string) {
    const token = await findActionToken(enrollmentToken, 'ADMIN_MFA_ENROLL');
    const user = await prisma.user.findFirst({ where: { id: token.userId, deletedAt: null } });
    if (!user || user.role === UserRole.CUSTOMER || !user.emailVerifiedAt || !user.pendingTwoFactorSecret) throw genericAuthError();
    const secret = decryptTotpSecret(user.pendingTwoFactorSecret);
    if (!authenticator.check(code, secret)) throw new AppError(400, 'Invalid authenticator code', 'INVALID_TOTP');
    const step = timeStep();
    await prisma.$transaction(async tx => {
      const used = await tx.emailActionToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError(400, 'Enrollment link is invalid or already used', 'INVALID_ACTION_TOKEN');
      await tx.user.update({ where: { id: user.id }, data: { twoFactorSecret: user.pendingTwoFactorSecret, pendingTwoFactorSecret: null, twoFactorEnabled: true, lastTotpTimeStep: step, totpFailureCount: 0, totpLockedUntil: null } });
    });
    return { enabled: true, nextStep: 'Sign in again and complete the authenticator challenge.' };
  }

  async enrollTotp(userId: string, password?: string, currentCode?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw genericAuthError();
    if (user.role !== UserRole.CUSTOMER && !user.twoFactorEnabled) throw new AppError(403, 'Administrators must use the verified email enrollment link', 'ADMIN_MFA_EMAIL_REQUIRED');
    if (user.twoFactorEnabled) {
      if (!currentCode || !user.twoFactorSecret) throw new AppError(400, 'Current authenticator code is required', 'REAUTH_REQUIRED');
      await this.verifyTotp(user, currentCode);
    } else {
      if (!password || !(await argon2.verify(user.passwordHash, password).catch(() => false))) throw new AppError(400, 'Password re-authentication is required', 'REAUTH_REQUIRED');
    }
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: userId }, data: { pendingTwoFactorSecret: encryptTotpSecret(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, env.TOTP_ISSUER, secret) };
  }
  async confirmTotp(userId: string, code: string, password?: string, currentCode?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pendingTwoFactorSecret) throw new AppError(400, 'Start authenticator enrollment first', 'MFA_ENROLLMENT_REQUIRED');
    if (user.twoFactorEnabled) {
      if (!currentCode || !user.twoFactorSecret) throw new AppError(400, 'Current authenticator code is required', 'REAUTH_REQUIRED');
      await this.verifyTotp(user, currentCode);
    } else if (!password || !(await argon2.verify(user.passwordHash, password).catch(() => false))) throw new AppError(400, 'Password re-authentication is required', 'REAUTH_REQUIRED');
    const newSecret = decryptTotpSecret(user.pendingTwoFactorSecret);
    if (!authenticator.check(code, newSecret)) throw new AppError(400, 'Invalid authenticator code', 'INVALID_TOTP');
    const step = timeStep();
    await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: user.pendingTwoFactorSecret, pendingTwoFactorSecret: null, twoFactorEnabled: true, lastTotpTimeStep: step, totpFailureCount: 0, totpLockedUntil: null } });
    return { enabled: true };
  }

  private async issueSession(user: { id: string; email: string; firstName: string; lastName: string; role: UserRole; emailVerifiedAt: Date | null }, ip?: string, userAgent?: string, mfa = false) {
    const rawRefresh = opaqueToken(); const familyId = crypto.randomUUID();
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: tokenHash(rawRefresh), familyId, mfaAuthenticated: mfa, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000), ...(ip ? { ipAddress: ip } : {}), ...(userAgent ? { userAgent } : {}) } });
    return { accessToken: issueAccess(user, mfa), refreshToken: rawRefresh, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, emailVerified: Boolean(user.emailVerifiedAt) } };
  }
  async refresh(rawToken: string, ip?: string, userAgent?: string) {
    const hash = tokenHash(rawToken); const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!token) throw unauthorized('Invalid refresh token');
    if (token.revokedAt) {
      if (token.replacedBy && Date.now() - token.revokedAt.getTime() <= REUSE_GRACE_MS) throw unauthorized('Refresh token was just rotated; retry with the latest cookie');
      await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('Refresh token reuse detected');
    }
    if (token.expiresAt <= new Date() || token.user.deletedAt) throw unauthorized('Refresh token expired');
    const next = opaqueToken();
    await prisma.$transaction(async tx => {
      const changed = await tx.refreshToken.updateMany({ where: { id: token.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (changed.count !== 1) throw unauthorized('Refresh rotation in progress; retry shortly');
      const replacement = await tx.refreshToken.create({ data: { userId: token.userId, tokenHash: tokenHash(next), familyId: token.familyId, mfaAuthenticated: token.mfaAuthenticated, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000), ...(ip ? { ipAddress: ip } : {}), ...(userAgent ? { userAgent } : {}) } });
      await tx.refreshToken.update({ where: { id: token.id }, data: { replacedBy: replacement.id } });
    });
    return { accessToken: issueAccess(token.user, token.mfaAuthenticated), refreshToken: next };
  }
  async logout(rawToken?: string) { if (rawToken) await prisma.refreshToken.updateMany({ where: { tokenHash: tokenHash(rawToken), revokedAt: null }, data: { revokedAt: new Date() } }); return { success: true }; }
}
