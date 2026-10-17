// SECURITY-CRITICAL
import { Router } from 'express';
import { z } from 'zod';
import { ProductStatus, UserRole, OrderStatus } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, forbidden } from '../../lib/errors.js';
import { searchSyncHook } from '../../search/sync-hook.js';
import { parseSingleImage, validateAndStoreImage, parseSingleModel, validateAndStoreGlb, signedMediaDownload } from '../../middleware/upload.js';

const router = Router();
router.param('id', (req, res, next, id) => { if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid UUID parameter' }); next(); });
router.use(authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), searchSyncHook);
const productSchema = z.object({ brandId: z.string().uuid(), categoryId: z.string().uuid(), name: z.string().trim().min(2).max(180), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200), sku: z.string().trim().min(2).max(80), shortDescription: z.string().max(500).optional(), description: z.string().min(10), gender: z.enum(['MEN','WOMEN','UNISEX']), movement: z.enum(['QUARTZ','AUTOMATIC','MANUAL','SOLAR','SMART']), caseSizeMm: z.number().positive().max(80), caseThicknessMm: z.number().positive().max(30).optional(), waterResistanceM: z.number().int().min(0).max(10000), basePrice: z.number().int().positive().max(2_000_000_000), compareAtPrice: z.number().int().positive().optional(), currency: z.string().length(3).default('INR'), status: z.enum(['DRAFT','ACTIVE','ARCHIVED']).default('DRAFT'), isFeatured: z.boolean().default(false), tags: z.array(z.string().max(60)).max(30).default([]), specifications: z.record(z.string(), z.any()).default({}) });

const slugify = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 130);
router.get('/catalog', async (_req, res, next) => { try { const [brands, categories] = await Promise.all([prisma.brand.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }), prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })]); res.json({ data: { brands, categories } }); } catch (e) { next(e); } });
router.post('/brands', async (req, res, next) => { try { const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body); const slug = slugify(name); if (!slug) throw badRequest('Invalid name'); const brand = await prisma.brand.upsert({ where: { slug }, create: { name, slug }, update: {}, select: { id: true, name: true } }); res.status(201).json({ data: brand }); } catch (e) { next(e); } });
router.post('/categories', async (req, res, next) => { try { const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body); const slug = slugify(name); if (!slug) throw badRequest('Invalid name'); const category = await prisma.category.upsert({ where: { slug }, create: { name, slug }, update: {}, select: { id: true, name: true } }); res.status(201).json({ data: category }); } catch (e) { next(e); } });
router.get('/products', async (_req, res, next) => { try { res.json({ data: await prisma.product.findMany({ where: { deletedAt: null }, include: { brand: true, category: true, variants: true, images: true, models3D: true }, orderBy: { updatedAt: 'desc' }, take: 200 }) }); } catch (e) { next(e); } });
router.post('/products', async (req, res, next) => { try { const input = productSchema.parse(req.body); const product = await prisma.product.create({ data: { ...input, status: input.status as ProductStatus } }); await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'ADMIN_PRODUCT_CREATED', resourceType: 'Product', resourceId: product.id } }); res.status(201).json({ data: product }); } catch (e) { next(e); } });
router.patch('/products/:id', async (req, res, next) => { try { const input = productSchema.partial().parse(req.body); const old = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!old) throw notFound('Product not found'); const product = await prisma.product.update({ where: { id: old.id }, data: input }); await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'ADMIN_PRODUCT_UPDATED', resourceType: 'Product', resourceId: product.id } }); res.json({ data: product }); } catch (e) { next(e); } });
router.delete('/products/:id', async (req, res, next) => { try { const old = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!old) throw notFound('Product not found'); const product = await prisma.product.update({ where: { id: old.id }, data: { status: 'ARCHIVED', deletedAt: new Date() } }); await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'ADMIN_PRODUCT_ARCHIVED', resourceType: 'Product', resourceId: product.id } }); res.json({ data: { id: product.id, status: product.status } }); } catch (e) { next(e); } });
router.post('/uploads/image', parseSingleImage, validateAndStoreImage);
router.post('/uploads/model', parseSingleModel, validateAndStoreGlb);
router.get('/uploads/:id/download', signedMediaDownload);
router.post('/products/:id/images/attach', async (req, res, next) => {
  try {
    const input = z.object({ assetId: z.string().uuid(), altText: z.string().trim().min(1).max(250), sortOrder: z.number().int().min(0).default(0), isPrimary: z.boolean().default(false) }).parse(req.body);
    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!product) throw notFound('Product not found');
      const asset = await tx.mediaAsset.findUnique({ where: { id: input.assetId } }); if (!asset || asset.kind !== 'IMAGE' || !asset.publicUrl) throw badRequest('An uploaded public image asset is required');
      if (input.isPrimary) await tx.productImage.updateMany({ where: { productId: product.id, isPrimary: true }, data: { isPrimary: false } });
      const image = await tx.productImage.create({ data: { productId: product.id, assetId: asset.id, url: asset.publicUrl, altText: input.altText, sortOrder: input.sortOrder, isPrimary: input.isPrimary } });
      await tx.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'PRODUCT_IMAGE_ATTACHED', resourceType: 'ProductImage', resourceId: image.id, metadata: { productId: product.id, assetId: asset.id } } }); return image;
    }); res.status(201).json({ data: result });
  } catch (e) { next(e); }
});
router.post('/products/:id/models/attach', async (req, res, next) => {
  try {
    const input = z.object({ assetId: z.string().uuid(), name: z.string().trim().min(1).max(150), dracoCompressed: z.boolean().default(false), meshoptCompressed: z.boolean().default(false), previewImageUrl: z.string().url().optional() }).parse(req.body);
    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!product) throw notFound('Product not found');
      const asset = await tx.mediaAsset.findUnique({ where: { id: input.assetId } }); if (!asset || asset.kind !== 'GLB' || !asset.publicUrl) throw badRequest('An uploaded public GLB asset is required');
      const model = await tx.product3DModel.create({ data: { productId: product.id, assetId: asset.id, name: input.name, glbUrl: asset.publicUrl, fileSizeBytes: asset.sizeBytes, dracoCompressed: input.dracoCompressed, meshoptCompressed: input.meshoptCompressed, previewImageUrl: input.previewImageUrl } });
      await tx.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'PRODUCT_3D_MODEL_ATTACHED', resourceType: 'Product3DModel', resourceId: model.id, metadata: { productId: product.id, assetId: asset.id } } }); return model;
    }); res.status(201).json({ data: result });
  } catch (e) { next(e); }
});
const variantSchema = z.object({ sku: z.string().min(2).max(100), name: z.string().min(2).max(150), strapMaterial: z.string().min(1).max(80), strapColor: z.string().min(1).max(60), dialColor: z.string().min(1).max(60), caseMaterial: z.string().min(1).max(80), caseColor: z.string().min(1).max(60), price: z.number().int().positive().max(2000000000), compareAtPrice: z.number().int().positive().optional(), stockQuantity: z.number().int().nonnegative().max(1000000).default(0), lowStockAt: z.number().int().nonnegative().default(5), isActive: z.boolean().default(true) });
router.post('/products/:id/variants', async (req,res,next) => { try { const input=variantSchema.parse(req.body); const product=await prisma.product.findFirst({where:{id:req.params.id,deletedAt:null}}); if(!product) throw notFound('Product not found'); const variant=await prisma.$transaction(async tx => { const created=await tx.productVariant.create({data:{...input,productId:product.id}}); await tx.auditLog.create({data:{actorUserId:req.auth!.userId,action:'ADMIN_VARIANT_CREATED',resourceType:'ProductVariant',resourceId:created.id,metadata:{productId:product.id,sku:created.sku}}}); return created; }); res.status(201).json({data:variant}); } catch(e){next(e);} });
router.patch('/variants/:id', async (req,res,next) => { try { const input=variantSchema.omit({stockQuantity:true}).partial().strict().parse(req.body); const result=await prisma.$transaction(async tx => { const changed=await tx.productVariant.updateMany({where:{id:req.params.id,deletedAt:null},data:input}); if(changed.count!==1) throw notFound('Variant not found'); const variant=await tx.productVariant.findUniqueOrThrow({where:{id:req.params.id}}); await tx.auditLog.create({data:{actorUserId:req.auth!.userId,action:'ADMIN_VARIANT_UPDATED',resourceType:'ProductVariant',resourceId:variant.id,metadata:{fields:Object.keys(input)}}}); return variant; }); res.json({data:result}); } catch(e){next(e);} });
router.delete('/variants/:id', async (req,res,next) => { try { await prisma.$transaction(async tx => { const changed=await tx.productVariant.updateMany({where:{id:req.params.id,deletedAt:null},data:{isActive:false,deletedAt:new Date()}}); if(changed.count!==1) throw notFound('Variant not found'); await tx.auditLog.create({data:{actorUserId:req.auth!.userId,action:'ADMIN_VARIANT_DELETED',resourceType:'ProductVariant',resourceId:req.params.id}}); }); res.status(204).end(); } catch(e){next(e);} });
router.patch('/variants/:id/inventory', async (req, res, next) => {
  try {
    const { adjustment, setTo } = z.object({ adjustment: z.number().int().min(-1000000).max(1000000).optional(), setTo: z.number().int().nonnegative().max(1000000).optional() }).refine(v => (v.adjustment !== undefined) !== (v.setTo !== undefined), 'Provide exactly one of adjustment or setTo').parse(req.body);
    const variant = await prisma.productVariant.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!variant) throw notFound('Variant not found');
    let updated;
    if (adjustment !== undefined) {
      const changed = await prisma.productVariant.updateMany({ where: { id: variant.id, stockQuantity: { gte: Math.max(0, -adjustment) } }, data: { stockQuantity: { increment: adjustment } } });
      if (changed.count !== 1) throw badRequest('Inventory cannot be negative or the variant changed concurrently');
    } else {
      const changed = await prisma.productVariant.updateMany({ where: { id: variant.id, stockQuantity: variant.stockQuantity }, data: { stockQuantity: setTo! } });
      if (changed.count !== 1) throw badRequest('Inventory changed concurrently; retry');
    }
    updated = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'INVENTORY_CHANGED', resourceType: 'ProductVariant', resourceId: variant.id, metadata: { previous: variant.stockQuantity, next: updated.stockQuantity } } });
    res.json({ data: updated });
  } catch(e) { next(e); }
});
router.get('/orders', async (req, res, next) => { try { const status = req.query.status ? z.nativeEnum(OrderStatus).parse(req.query.status) : undefined; res.json({ data: await prisma.order.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, items: true, payments: true }, take: 200 }) }); } catch (e) { next(e); } });
router.patch('/orders/:id/status', async (req,res,next) => {
  try {
    const { status } = z.object({ status: z.enum(['SHIPPED','DELIVERED','CANCELLED','REFUNDED']) }).parse(req.body);
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: req.params.id }, include: { items: true, payments: true } });
      if (!order) throw notFound('Order not found');
      const isCod = order.payments.some(p => p.provider === 'COD' && p.status === 'PROCESSING');
      const allowed: Record<string,string[]> = { PAID:['SHIPPED'], SHIPPED:['DELIVERED'], PENDING: isCod ? ['SHIPPED','CANCELLED'] : ['CANCELLED'] };
      if (!allowed[order.status]?.includes(status)) throw badRequest(`Transition ${order.status} → ${status} is not allowed through this endpoint`);
      if (status === 'CANCELLED' && order.payments.some(payment => payment.stripeCheckoutSessionId || payment.stripePaymentIntentId)) throw badRequest('Cannot cancel an order with an existing Stripe Checkout session or PaymentIntent');
      const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status, ...(status === 'CANCELLED' ? { checkoutStartedAt: null, payments: { none: { OR: [{ stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }] } } } : {}) }, data: { status, ...(status === 'SHIPPED' ? { shippedAt:new Date() } : {}), ...(status === 'DELIVERED' ? { deliveredAt:new Date() } : {}), ...(status === 'CANCELLED' ? { cancelledAt:new Date(), cancellationReason:'Cancelled by administrator' } : {}) } });
      if (changed.count !== 1) throw badRequest('Order status changed concurrently or checkout has started; reload and retry');
      if (isCod && status === 'DELIVERED') await tx.payment.updateMany({ where: { orderId: order.id, provider: 'COD', status: 'PROCESSING' }, data: { status: 'SUCCEEDED' } });
      if (isCod && order.status === 'SHIPPED' && status === 'DELIVERED') await tx.order.update({ where: { id: order.id }, data: { paidAt: new Date() } });
      if (isCod && status === 'CANCELLED') await tx.payment.updateMany({ where: { orderId: order.id, provider: 'COD', status: 'PROCESSING' }, data: { status: 'CANCELLED' } });
      if (status === 'CANCELLED') for (const item of order.items) await tx.productVariant.updateMany({ where: { id:item.variantId }, data: { stockQuantity:{ increment:item.quantity } } });
      await tx.auditLog.create({ data:{ actorUserId:req.auth!.userId, action:'ADMIN_ORDER_STATUS_CHANGED', resourceType:'Order', resourceId:order.id, metadata:{from:order.status,to:status} } });
      return tx.order.findUniqueOrThrow({ where:{id:order.id} });
    }, { isolationLevel:'ReadCommitted' });
    res.json({data:result});
  } catch(e) { next(e); }
});
router.get('/users', async (req, res, next) => { try { const page = z.coerce.number().int().min(1).default(1).parse(req.query.page); const users = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, email: true, firstName: true, lastName: true, role: true, emailVerifiedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }); res.json({ data: users, page, limit: 50 }); } catch (e) { next(e); } });
router.patch('/users/:id/role', async (req, res, next) => { try { if (req.auth!.role !== UserRole.SUPER_ADMIN) throw forbidden('Only a super admin may change roles'); const { role } = z.object({ role: z.nativeEnum(UserRole) }).parse(req.body); if (req.params.id === req.auth!.userId) throw badRequest('Cannot change your own role'); const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } , select: { id: true, email: true, role: true } }); await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'USER_ROLE_CHANGED', resourceType: 'User', resourceId: user.id, severity: 'WARNING', metadata: { role } } }); res.json({ data: user }); } catch (e) { next(e); } });
router.get('/analytics', async (_req, res, next) => { try { const since = new Date(Date.now() - 30 * 86400_000); const [paidOrders, topItems, daily] = await Promise.all([prisma.order.aggregate({ where: { status: { in: ['PAID','SHIPPED','DELIVERED'] }, createdAt: { gte: since } }, _sum: { totalAmount: true }, _count: { _all: true } }), prisma.orderItem.groupBy({ by: ['productId','productName'], where: { order: { status: { in: ['PAID','SHIPPED','DELIVERED'] }, createdAt: { gte: since } } }, _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 }), prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, totalAmount: true, status: true }, orderBy: { createdAt: 'asc' }, take: 5000 })]); const byDay = new Map<string, { orders: number; revenue: number }>(); for (const order of daily) { const day = order.createdAt.toISOString().slice(0,10); const row = byDay.get(day) ?? { orders: 0, revenue: 0 }; row.orders++; if (['PAID','SHIPPED','DELIVERED'].includes(order.status)) row.revenue += order.totalAmount; byDay.set(day, row); } res.json({ data: { periodDays: 30, revenueMinorUnits: paidOrders._sum.totalAmount ?? 0, paidOrderCount: paidOrders._count._all, topProducts: topItems, ordersPerDay: [...byDay.entries()].map(([date, values]) => ({ date, ...values })) } }); } catch (e) { next(e); } });
router.get('/reviews', async (req, res, next) => { try { const status = z.enum(['pending','published']).default('pending').parse(req.query.status); res.json({ data: await prisma.review.findMany({ where: { deletedAt: null, isPublished: status === 'published' }, include: { product: { select: { id: true, name: true } }, user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }) }); } catch (e) { next(e); } });
router.patch('/reviews/:id/moderate', async (req, res, next) => { try { const { publish } = z.object({ publish: z.boolean() }).parse(req.body); const review = await prisma.review.findFirst({ where: { id: req.params.id, deletedAt: null } }); if (!review) throw notFound('Review not found'); const updated = await prisma.review.update({ where: { id: review.id }, data: { isPublished: publish, moderatedAt: new Date(), moderatedBy: req.auth!.userId } }); await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'REVIEW_MODERATED', resourceType: 'Review', resourceId: review.id, metadata: { published: publish } } }); res.json({ data: updated }); } catch (e) { next(e); } });
export default router;
