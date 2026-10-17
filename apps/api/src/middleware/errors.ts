import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof multer.MulterError) { const tooLarge = error.code === 'LIMIT_FILE_SIZE'; res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'Uploaded file exceeds the permitted size' : 'Invalid upload request', code: error.code }); return; }
  // body-parser (express.json / express.raw) failures: malformed JSON, oversized or wrongly encoded bodies are client errors, not 500s.
  const parserError = error as { type?: string; status?: number };
  if (typeof parserError?.type === 'string' && parserError.type.startsWith('entity.')) {
    const status = parserError.type === 'entity.too.large' ? 413 : parserError.type === 'entity.parse.failed' || parserError.type === 'entity.verify.failed' ? 400 : (parserError.status ?? 400);
    res.status(status).json({ error: status === 413 ? 'Request body too large' : 'Invalid request body', code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', requestId: req.id });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { res.status(404).json({ error: 'Resource not found', code: 'NOT_FOUND' }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: 'A record with this value already exists', code: 'CONFLICT' });
    return;
  }
  const appError = error instanceof AppError ? error : new AppError(500, 'Internal server error', 'INTERNAL_ERROR');
  if (appError.statusCode >= 500) logger.error({ err: error, requestId: req.id }, 'Unhandled request error');
  res.status(appError.statusCode).json({ error: appError.message, code: appError.code, requestId: req.id });
};
