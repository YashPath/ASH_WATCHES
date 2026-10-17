import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token', 'req.headers["x-csrf-token"]',
      'res.headers.set-cookie', 'res.headers["set-cookie"]', '*.password',
      '*.passwordHash', '*.token', '*.tokenHash', '*.twoFactorSecret', '*.secret'
    ],
    censor: '[REDACTED]'
  }
});
