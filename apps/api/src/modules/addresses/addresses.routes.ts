import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const router = Router(); router.use(authenticate);
const addressSchema = z.object({ type: z.enum(['SHIPPING','BILLING','BOTH']).default('SHIPPING'), fullName: z.string().trim().min(1).max(150), phone: z.string().trim().min(7).max(30), line1: z.string().trim().min(1).max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().min(1).max(100), state: z.string().trim().min(1).max(100), postalCode: z.string().trim().min(3).max(20), countryCode: z.string().length(2).default('IN'), isDefault: z.boolean().default(false) });
router.get('/', async (req, res, next) => { try { res.json({ data: await prisma.address.findMany({ where: { userId: req.auth!.userId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }) }); } catch (e) { next(e); } });
router.post('/', async (req, res, next) => { try { const input = addressSchema.parse(req.body); const address = await prisma.$transaction(async tx => { if (input.isDefault) await tx.address.updateMany({ where: { userId: req.auth!.userId, deletedAt: null }, data: { isDefault: false } }); return tx.address.create({ data: { ...input, userId: req.auth!.userId } }); }); res.status(201).json({ data: address }); } catch (e) { next(e); } });
router.put('/:id', async (req, res, next) => { try { const input = addressSchema.partial().parse(req.body); const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null } }); if (!existing) throw notFound('Address not found'); const updated = await prisma.$transaction(async tx => { if (input.isDefault) await tx.address.updateMany({ where: { userId: req.auth!.userId, deletedAt: null, id: { not: existing.id } }, data: { isDefault: false } }); return tx.address.update({ where: { id: existing.id }, data: input }); }); res.json({ data: updated }); } catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try { const address = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null } }); if (!address) throw notFound('Address not found'); await prisma.address.update({ where: { id: address.id }, data: { deletedAt: new Date(), isDefault: false } }); res.status(204).end(); } catch (e) { next(e); } });
export default router;
