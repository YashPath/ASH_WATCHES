import nodemailer from 'nodemailer';
import { Queue, Worker } from 'bullmq';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { queueRedis } from '../middleware/security.js';
import type { EmailActionType } from '@prisma/client';

type ActionJob = { email: string; type: EmailActionType };
const emailQueue = new Queue<ActionJob>('transactional-email', {
  connection: queueRedis,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: { age: 3600 } }
});
let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
function getTransporter() {
  if (env.EMAIL_PROVIDER === 'console') return null;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) throw new Error('SMTP is not configured');
  transporter ??= nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
  return transporter;
}
function tokenHash(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function opaqueToken() { return crypto.randomBytes(48).toString('base64url'); }
async function processAction(job: ActionJob) {
  const email = job.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) return;
  if (job.type === 'VERIFY_EMAIL' && user.emailVerifiedAt) return;
  if (job.type === 'ADMIN_MFA_ENROLL' && (user.role === 'CUSTOMER' || !user.emailVerifiedAt || user.twoFactorEnabled)) return;
  const raw = opaqueToken();
  const expiresAt = new Date(Date.now() + (job.type === 'VERIFY_EMAIL' ? 24 * 3600_000 : job.type === 'ADMIN_MFA_ENROLL' ? 30 * 60_000 : 3600_000));
  await prisma.$transaction(async tx => {
    await tx.emailActionToken.updateMany({ where: { userId: user.id, type: job.type, usedAt: null }, data: { usedAt: new Date() } });
    await tx.emailActionToken.create({ data: { userId: user.id, type: job.type, tokenHash: tokenHash(raw), expiresAt } });
  });
  const route = job.type === 'VERIFY_EMAIL' ? '/verify-email' : job.type === 'RESET_PASSWORD' ? '/reset-password' : '/admin-mfa-enroll';
  const action = job.type === 'VERIFY_EMAIL' ? 'Verify your ASH_ email' : job.type === 'RESET_PASSWORD' ? 'Reset your ASH_ password' : 'Set up ASH_ administrator MFA';
  const url = `${env.FRONTEND_ORIGIN}${route}#token=${encodeURIComponent(raw)}`;
  const text = `${action}: ${url}`;
  const html = `<p>${action}:</p><p><a href="${url}">${action}</a></p>`;
  const mailer = getTransporter();
  if (!mailer) {
    if (env.NODE_ENV === 'development') logger.info({ email: user.email, type: job.type, actionUrl: url }, 'Development email action link');
    else logger.info({ email: user.email, type: job.type }, 'Console email action suppressed outside development');
    return;
  }
  await mailer.sendMail({ from: env.EMAIL_FROM, to: user.email, subject: action, text, html });
}
export const emailWorker = new Worker<ActionJob>('transactional-email', async job => processAction(job.data), { connection: queueRedis, concurrency: 5 });
emailWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Transactional email failed'));
export async function queueActionEmail(email: string, type: EmailActionType) {
  await emailQueue.add('action-email', { email: email.trim().toLowerCase(), type });
}
export async function closeEmailQueue() { await Promise.allSettled([emailWorker.close(), emailQueue.close()]); }
