import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const moneyMinorUnitsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(48).default(12) });
export const orderStatusSchema = z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']);
export type OrderStatusContract = z.infer<typeof orderStatusSchema>;
