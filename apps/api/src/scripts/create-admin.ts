/**
 * Create (or promote) an administrator.
 * Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-passphrase' pnpm --filter @ash/api create:admin
 * The password comes from the environment so it never lands in shell history as an argument.
 * On first sign-in the admin is walked through two-factor enrollment (an emailed link to /admin-mfa-enroll).
 */
import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Set ADMIN_EMAIL to a valid address.'); process.exit(1); }
if (!password || password.length < 12) { console.error('Set ADMIN_PASSWORD (at least 12 characters).'); process.exit(1); }

const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const user = await prisma.user.upsert({
  where: { email },
  update: { role: 'ADMIN', passwordHash, emailVerifiedAt: new Date() },
  create: { email, passwordHash, firstName: 'Admin', lastName: 'User', role: 'ADMIN', emailVerifiedAt: new Date() }
});
console.log(`Admin ready: ${user.email} (${user.id}). Sign in at /login; you will be asked to set up two-factor.`);
await prisma.$disconnect();
