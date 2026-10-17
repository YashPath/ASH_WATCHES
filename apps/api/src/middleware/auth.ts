// SECURITY-CRITICAL
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare global { namespace Express { interface Request { id?: string; auth?: { userId: string; role: UserRole; twoFactorEnabled: boolean; emailVerified: boolean; mfa: boolean } } } }
type AccessClaims = { sub: string; role: UserRole; typ: 'access'; jti: string; mfa?: boolean };
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'ash-api', audience: 'ash-web' }) as jwt.JwtPayload & AccessClaims;
    if (claims.typ !== 'access' || !claims.sub) throw unauthorized('Invalid access token');
    const user = await prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null }, select: { id: true, role: true, twoFactorEnabled: true, emailVerifiedAt: true } });
    if (!user) throw unauthorized();
    req.auth = { userId: user.id, role: user.role, twoFactorEnabled: user.twoFactorEnabled, emailVerified: Boolean(user.emailVerifiedAt), mfa: claims.mfa === true };
    next();
  } catch (error) { next(error instanceof jwt.JsonWebTokenError ? unauthorized('Invalid or expired access token') : error); }
}
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    if (req.auth.role !== UserRole.CUSTOMER && (!req.auth.twoFactorEnabled || !req.auth.mfa)) return next(forbidden('Admin session requires a completed MFA challenge'));
    next();
  };
}
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) { if (!req.auth?.emailVerified) return next(forbidden('Verify your email before continuing')); next(); }
