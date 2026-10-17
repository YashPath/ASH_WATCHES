/**
 * Demo catalogue: 4 brands, 4 categories, 12 watches with variants and generated product images, plus a demo customer.
 * Idempotent: re-running updates products by slug and never duplicates. Usage: pnpm --filter @ash/api seed:demo
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import argon2 from 'argon2';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

type Dial = { name: string; dial: string; metal: string; strap: string; strapName: string; caseName: string };
const DIALS: Record<string, Dial> = {
  blue: { name: 'Blue', dial: '#1d3a6b', metal: '#c9ccd1', strap: '#16181c', strapName: 'Black', caseName: 'Silver' },
  champagne: { name: 'Champagne', dial: '#d8c394', metal: '#c9a54f', strap: '#4a2f1d', strapName: 'Brown', caseName: 'Gold' },
  green: { name: 'Green', dial: '#1f4d3a', metal: '#b7bcc4', strap: '#24473b', strapName: 'Green', caseName: 'Steel' },
  black: { name: 'Black', dial: '#1a1d22', metal: '#8f949b', strap: '#7b818b', strapName: 'Grey', caseName: 'Titanium' },
  white: { name: 'White', dial: '#f1efe9', metal: '#c98f7a', strap: '#d4a0a8', strapName: 'Pink', caseName: 'Rose Gold' }
};

const BRANDS = [['Ashford', 'ashford'], ['Meridian', 'meridian'], ['Nordhaven', 'nordhaven'], ['Kaveri Time', 'kaveri-time']] as const;
const CATEGORIES = [['Dress', 'dress'], ['Diver', 'diver'], ['Sport', 'sport'], ['Everyday', 'everyday']] as const;

type Seed = { name: string; brand: string; category: string; gender: 'MEN' | 'WOMEN' | 'UNISEX'; movement: 'AUTOMATIC' | 'QUARTZ' | 'SOLAR' | 'MANUAL'; size: number; wr: number; price: number; compare?: number; featured?: boolean; dials: Array<keyof typeof DIALS>; blurb: string; desc: string; tags: string[]; strapMaterial: string };
const WATCHES: Seed[] = [
  { name: 'Meridian Auto', brand: 'meridian', category: 'dress', gender: 'MEN', movement: 'AUTOMATIC', size: 40, wr: 50, price: 4500000, compare: 5000000, featured: true, dials: ['blue', 'champagne'], blurb: 'A calm automatic dress watch.', desc: 'A self-winding dress watch with a sunburst dial, sapphire crystal and a 70-hour power reserve. Slim enough to slide under a cuff, sturdy enough for every day.', tags: ['dress', 'formal', 'automatic'], strapMaterial: 'Leather' },
  { name: 'Lune Slim', brand: 'ashford', category: 'dress', gender: 'WOMEN', movement: 'QUARTZ', size: 32, wr: 30, price: 2800000, featured: true, dials: ['white', 'champagne'], blurb: 'Slim, light and easy to dress up.', desc: 'A 32 mm slim quartz watch with a mother-of-pearl style dial and a soft leather strap. Light on the wrist, made for weddings, offices and gifting.', tags: ['dress', 'gift', 'slim'], strapMaterial: 'Leather' },
  { name: 'Abyss Diver', brand: 'nordhaven', category: 'diver', gender: 'MEN', movement: 'AUTOMATIC', size: 42, wr: 300, price: 8900000, featured: true, dials: ['green', 'blue', 'black'], blurb: 'A proper 300 m diver.', desc: 'Rugged automatic dive watch with a unidirectional rotating bezel, luminous markers and 300 m water resistance. Built for swimming, snorkelling and rough weekends.', tags: ['dive', 'swim', 'rugged', 'automatic'], strapMaterial: 'Rubber' },
  { name: 'Solstice Solar', brand: 'kaveri-time', category: 'sport', gender: 'UNISEX', movement: 'SOLAR', size: 41, wr: 100, price: 1500000, dials: ['black', 'green'], blurb: 'Runs on light, never needs a battery.', desc: 'A solar-powered sports watch that charges from any light. Scratch-resistant crystal, 100 m water resistance and a lightweight titanium case for running and the gym.', tags: ['sport', 'solar', 'gym', 'running'], strapMaterial: 'Nylon' },
  { name: 'Harbour Chrono', brand: 'ashford', category: 'sport', gender: 'MEN', movement: 'QUARTZ', size: 43, wr: 100, price: 3200000, dials: ['blue', 'black'], blurb: 'A chronograph that is easy to read.', desc: 'Three-register quartz chronograph with a tachymeter bezel. Clear, high-contrast dial and a steel bracelet that is comfortable all day.', tags: ['chronograph', 'sport'], strapMaterial: 'Steel' },
  { name: 'Rani Petite', brand: 'kaveri-time', category: 'everyday', gender: 'WOMEN', movement: 'QUARTZ', size: 28, wr: 30, price: 1800000, compare: 2200000, dials: ['white', 'champagne'], blurb: 'A small everyday watch with a bit of sparkle.', desc: 'A petite 28 mm everyday watch with a rose-gold case and a soft-touch strap. Light, simple and a thoughtful gift.', tags: ['gift', 'petite', 'everyday'], strapMaterial: 'Leather' },
  { name: 'Orbit Skeleton', brand: 'meridian', category: 'dress', gender: 'MEN', movement: 'MANUAL', size: 41, wr: 50, price: 12500000, featured: true, dials: ['black', 'blue'], blurb: 'See the movement work.', desc: 'A hand-wound skeleton watch that lets you see the balance wheel and gear train. Finished by hand, with a sapphire front and back.', tags: ['skeleton', 'luxury', 'hand-wound'], strapMaterial: 'Leather' },
  { name: 'Trek Field', brand: 'nordhaven', category: 'sport', gender: 'MEN', movement: 'QUARTZ', size: 44, wr: 200, price: 2400000, dials: ['green', 'black'], blurb: 'A field watch that takes a beating.', desc: 'Tough quartz field watch with a brushed steel case, big luminous numerals and a canvas strap. Made for treks, camping and daily knocks.', tags: ['field', 'outdoor', 'rugged', 'trek'], strapMaterial: 'Canvas' },
  { name: 'Aarav Classic', brand: 'kaveri-time', category: 'everyday', gender: 'MEN', movement: 'QUARTZ', size: 39, wr: 50, price: 950000, dials: ['blue', 'white'], blurb: 'A first good watch, honestly priced.', desc: 'A clean 39 mm three-hand quartz watch. Simple dial, mineral crystal and a leather strap. A first good watch for college or the first job.', tags: ['budget', 'starter', 'everyday'], strapMaterial: 'Leather' },
  { name: 'Selene Auto', brand: 'ashford', category: 'dress', gender: 'WOMEN', movement: 'AUTOMATIC', size: 34, wr: 50, price: 5900000, dials: ['white', 'green'], blurb: 'A small automatic with a moon-phase feel.', desc: 'A 34 mm automatic with an exhibition back and a soft gold-tone case. Quietly elegant, and it never needs a battery.', tags: ['automatic', 'elegant', 'gift'], strapMaterial: 'Leather' },
  { name: 'Pulse Smart', brand: 'meridian', category: 'sport', gender: 'UNISEX', movement: 'QUARTZ', size: 44, wr: 50, price: 2100000, dials: ['black'], blurb: 'Fitness basics without the noise.', desc: 'A quartz sports watch with a digital-style dial, stopwatch and 50 m water resistance. Straightforward and long-lasting.', tags: ['sport', 'fitness', 'digital'], strapMaterial: 'Silicone' },
  { name: 'Sagar 600', brand: 'nordhaven', category: 'diver', gender: 'MEN', movement: 'AUTOMATIC', size: 45, wr: 600, price: 15900000, compare: 17500000, dials: ['blue', 'black'], blurb: 'Our deepest diver.', desc: 'A 600 m automatic diver with a helium escape valve, screw-down crown and a bracelet with a dive extension. Over-built, on purpose.', tags: ['dive', 'professional', 'automatic', 'luxury'], strapMaterial: 'Steel' }
];

function watchSvg(d: Dial, variant: 0 | 1): string {
  const light = d.dial === '#f1efe9' || d.dial === '#d8c394';
  const ink = light ? '#1b1b1b' : '#efe6c8';
  const bg = variant === 0 ? ['#1d4a38', '#05110c'] : ['#2a2410', '#0a1a13'];
  const marks = Array.from({ length: 60 }, (_, i) => `<rect x="399" y="${i % 5 === 0 ? 150 : 150}" width="${i % 5 === 0 ? 5 : 2}" height="${i % 5 === 0 ? 34 : 16}" fill="${ink}" opacity="${i % 5 === 0 ? 1 : 0.6}" transform="rotate(${i * 6} 400 400)"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
<radialGradient id="dial" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${d.dial}"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="${d.metal}"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
<linearGradient id="strap" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".5" stop-color="${d.strap}"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#bg)"/>
<g transform="${variant === 1 ? 'rotate(-14 400 400) translate(0 10)' : ''}">
<rect x="300" y="0" width="200" height="800" rx="26" fill="url(#strap)"/><rect x="318" y="0" width="5" height="800" fill="#fff" opacity=".08"/>
${Array.from({ length: 8 }, (_, i) => `<rect x="396" y="${30 + i * 28}" width="8" height="14" rx="3" fill="#ecd9a3" opacity=".55"/>`).join('')}
<circle cx="400" cy="400" r="262" fill="url(#metal)"/><circle cx="400" cy="400" r="236" fill="#000" opacity=".35"/><circle cx="400" cy="400" r="228" fill="url(#dial)"/>
<rect x="650" y="384" width="34" height="32" rx="8" fill="url(#metal)"/>
${marks}
${Array.from({ length: 12 }, (_, i) => `<rect x="391" y="178" width="${i % 3 === 0 ? 18 : 10}" height="${i % 3 === 0 ? 60 : 38}" rx="2" fill="${ink}" transform="rotate(${i * 30} 400 400)"/>`).join('')}
<text x="400" y="300" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="${ink}" opacity=".9" letter-spacing="4">${d.name === 'Black' ? 'ASH_' : 'ASH_'}</text>
<text x="400" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="${ink}" opacity=".6" letter-spacing="3">AUTOMATIC</text>
<line x1="400" y1="400" x2="400" y2="270" stroke="${ink}" stroke-width="14" stroke-linecap="round" transform="rotate(300 400 400)"/>
<line x1="400" y1="400" x2="400" y2="205" stroke="${ink}" stroke-width="10" stroke-linecap="round" transform="rotate(60 400 400)"/>
<line x1="400" y1="440" x2="400" y2="190" stroke="#c3402f" stroke-width="4" transform="rotate(150 400 400)"/><circle cx="400" cy="400" r="14" fill="#c3402f"/><circle cx="400" cy="400" r="5" fill="#111"/>
<ellipse cx="330" cy="260" rx="150" ry="60" fill="#fff" opacity=".07" transform="rotate(-30 330 260)"/></g></svg>`;
}

async function main() {
  const dir = path.resolve(env.PUBLIC_MEDIA_DIR, 'products');
  await fs.mkdir(dir, { recursive: true });
  const brands = new Map<string, string>(), categories = new Map<string, string>();
  for (const [name, slug] of BRANDS) brands.set(slug, (await prisma.brand.upsert({ where: { slug }, update: { name, isActive: true, deletedAt: null }, create: { name, slug } })).id);
  for (const [name, slug] of CATEGORIES) categories.set(slug, (await prisma.category.upsert({ where: { slug }, update: { name, isActive: true }, create: { name, slug } })).id);

  for (const w of WATCHES) {
    const slug = w.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const base = { brandId: brands.get(w.brand)!, categoryId: categories.get(w.category)!, name: w.name, shortDescription: w.blurb, description: w.desc, gender: w.gender, movement: w.movement, caseSizeMm: new Prisma.Decimal(w.size), caseThicknessMm: new Prisma.Decimal(10.5), waterResistanceM: w.wr, crystal: w.price > 3000000 ? 'Sapphire' : 'Mineral', powerReserveHours: w.movement === 'AUTOMATIC' ? 70 : null, basePrice: w.price, compareAtPrice: w.compare ?? null, isFeatured: w.featured ?? false, status: 'ACTIVE' as const, tags: w.tags, deletedAt: null };
    const product = await prisma.product.upsert({ where: { slug }, update: base, create: { ...base, slug, sku: `ASH-${slug.toUpperCase().slice(0, 12)}` } });
    for (const key of w.dials) {
      const d = DIALS[key]!;
      const sku = `${product.sku}-${key.toUpperCase()}`;
      const data = { productId: product.id, name: `${d.name} dial / ${d.strapName} strap`, strapMaterial: w.strapMaterial, strapColor: d.strapName, dialColor: d.name, caseMaterial: d.caseName === 'Titanium' ? 'Titanium' : 'Stainless steel', caseColor: d.caseName, price: w.price + (key === 'champagne' ? 200000 : 0), stockQuantity: 8, isActive: true, deletedAt: null };
      await prisma.productVariant.upsert({ where: { sku }, update: data, create: { ...data, sku } });
    }
    await prisma.productImage.deleteMany({ where: { productId: product.id, assetId: null } });
    const first = DIALS[w.dials[0]!]!;
    for (const v of [0, 1] as const) {
      const file = `${slug}-${v + 1}.png`;
      await sharp(Buffer.from(watchSvg(first, v))).png({ compressionLevel: 9 }).toFile(path.join(dir, file));
      await prisma.productImage.create({ data: { productId: product.id, url: `/media-public/products/${file}`, altText: `${w.name} ${v === 0 ? 'front view' : 'angled view'}`, sortOrder: v, isPrimary: v === 0, width: 800, height: 800 } });
    }
  }

  const email = 'demo@ash.test';
  await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash: await argon2.hash('Demo-Customer-2026!', { type: argon2.argon2id }), firstName: 'Demo', lastName: 'Customer', emailVerifiedAt: new Date() } });
  console.log(`Seeded ${WATCHES.length} watches. Demo customer: ${email} / Demo-Customer-2026!`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
