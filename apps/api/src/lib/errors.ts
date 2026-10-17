export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, message, 'BAD_REQUEST');
export const unauthorized = (message = 'Authentication required') => new AppError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'Insufficient permissions') => new AppError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Resource not found') => new AppError(404, message, 'NOT_FOUND');
