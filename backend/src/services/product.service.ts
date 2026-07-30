import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { Product } from '@prisma/client';
import type { ProductListQuery } from '../schemas/product.schema';

/**
 * Product service — garment catalog.
 *
 * Reads are public (any authed user can browse). Writes are admin-only.
 *
 * `sizes` + `colors` are stored as JSON strings in the DB (provider-agnostic)
 * but exposed as typed arrays to the frontend.
 */

const svcLogger = logger.child({ service: 'product' });

/** Shape returned to the frontend — matches the frontend's `Product` type. */
export interface ProductDto {
  id: string;
  sku: string;
  code: string | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: string | null;
  imageUrl: string | null;
  garmentOverlayUrl: string | null;
  sizes: string[];
  colors: { name: string; hex: string }[];
  isNew: boolean;
  inStock: boolean;
  trendingScore: number;
}

interface ColorEntry {
  name: string;
  hex: string;
}

function parseSizes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function parseColors(raw: string | null | undefined): ColorEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is ColorEntry =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as ColorEntry).name === 'string' &&
          typeof (c as ColorEntry).hex === 'string',
      );
  } catch {
    return [];
  }
}

function toDto(p: Product): ProductDto {
  return {
    id: p.id,
    sku: p.sku,
    code: p.code,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    category: p.category,
    imageUrl: p.imageUrl,
    garmentOverlayUrl: p.garmentOverlayUrl,
    sizes: parseSizes(p.sizes),
    colors: parseColors(p.colors),
    isNew: p.isNew,
    inStock: p.inStock,
    trendingScore: p.trendingScore,
  };
}

/**
 * Lists products with optional filters + sort. Always returns an array (never
 * null) so the frontend's `unwrapProductList` helper can short-circuit
 * gracefully.
 */
export async function listProducts(query: ProductListQuery): Promise<{
  products: ProductDto[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 100;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (query.category) where.category = query.category;
  if (typeof query.isNew === 'boolean') where.isNew = query.isNew;
  if (typeof query.inStock === 'boolean') where.inStock = query.inStock;
  if (query.search) {
    // Case-insensitive contains on name, sku, code, description.
    // Works on both MongoDB (contains with mode insens) + Postgres/SQLite.
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  let orderBy: Record<string, string> = { trendingScore: 'desc' };
  switch (query.sort) {
    case 'newest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'price-asc':
      orderBy = { price: 'asc' };
      break;
    case 'price-desc':
      orderBy = { price: 'desc' };
      break;
    case 'trending':
    default:
      orderBy = { trendingScore: 'desc' };
      break;
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: rows.map(toDto),
    total,
    page,
    pageSize,
  };
}

export async function getProductById(id: string): Promise<ProductDto | null> {
  const p = await prisma.product.findUnique({ where: { id } });
  return p ? toDto(p) : null;
}

export async function getProductBySku(sku: string): Promise<ProductDto | null> {
  const p = await prisma.product.findUnique({ where: { sku } });
  return p ? toDto(p) : null;
}

/**
 * Seeds a set of dummy products if the catalog is empty. Idempotent —
 * safe to call on every boot. The frontend has its own fallback dummy list,
 * but seeding the DB means the admin portal's product dashboard also works.
 *
 * Seeds 32 products (8 hand-crafted + 24 generated) so the trending rail can
 * scroll past 30 items as required by the spec.
 */
export async function seedDummyProductsIfEmpty(): Promise<void> {
  const count = await prisma.product.count();
  if (count > 0) return;

  svcLogger.info('Product catalog empty — seeding 32 dummy garments.');
  const baseDummies = [
    {
      sku: 'AN-SU-ANARKALI-001', code: 'NOVA-001', name: 'Anarkali Suit',
      description: 'Floor-length Anarkali in flowy georgette with gold zari yoke.',
      price: 459, category: 'Suits', sizes: ['XS','S','M','L','XL'],
      colors: [{name:'Emerald',hex:'#0f766e'},{name:'Wine',hex:'#7c2d4a'}],
      isNew: true, trendingScore: 92,
    },
    {
      sku: 'AN-SK-SHALWAR-002', code: 'NOVA-002', name: 'Shalwar Kameez',
      description: 'Classic three-piece in breathable cotton-silk with chikan embroidery.',
      price: 289, category: 'Suits', sizes: ['S','M','L','XL'],
      colors: [{name:'Ivory',hex:'#f5f0e6'},{name:'Indigo',hex:'#1e3a8a'}],
      isNew: true, trendingScore: 88,
    },
    {
      sku: 'AN-LE-LEHENGA-003', code: 'NOVA-003', name: 'Lehenga Choli',
      description: 'Flared lehenga with all-over sequin and thread work.',
      price: 789, category: 'Bridal', sizes: ['XS','S','M','L'],
      colors: [{name:'Blush',hex:'#f9a8b8'},{name:'Gold',hex:'#c9a55c'}],
      isNew: true, trendingScore: 85,
    },
    {
      sku: 'AN-SA-SAREE-004', code: 'NOVA-004', name: 'Silk Saree',
      description: 'Handloom Banarasi silk saree with broad gold border.',
      price: 549, category: 'Sarees', sizes: ['Free Size'],
      colors: [{name:'Crimson',hex:'#9f1239'},{name:'Royal',hex:'#4c1d95'}],
      isNew: false, trendingScore: 79,
    },
    {
      sku: 'AN-KS-KURTA-005', code: 'NOVA-005', name: 'Kurta Set',
      description: 'Everyday kurta set in modal cotton with palazzo pants.',
      price: 179, category: 'Suits', sizes: ['XS','S','M','L','XL','XXL'],
      colors: [{name:'Mustard',hex:'#d4a017'},{name:'Teal',hex:'#0d9488'}],
      isNew: true, trendingScore: 74,
    },
    {
      sku: 'AN-SW-SHERWANI-006', code: 'NOVA-006', name: 'Sherwani',
      description: 'Tailored sherwani in raw silk with mandarin collar.',
      price: 699, category: 'Bridal', sizes: ['38','40','42','44','46'],
      colors: [{name:'Ivory',hex:'#f5f0e6'},{name:'Charcoal',hex:'#1f2937'}],
      isNew: false, trendingScore: 71,
    },
    {
      sku: 'AN-PS-PALAZZO-007', code: 'NOVA-007', name: 'Palazzo Suit',
      description: 'A-line short kurta with wide-leg palazzo pants.',
      price: 239, category: 'Suits', sizes: ['S','M','L','XL'],
      colors: [{name:'Peach',hex:'#fbcfa8'},{name:'Mint',hex:'#a7f3d0'}],
      isNew: false, trendingScore: 68,
    },
    {
      sku: 'AN-CK-CHURIDAR-008', code: 'NOVA-008', name: 'Churidar Kameez',
      description: 'Slim-fit churidar kameez in viscose with gota patti.',
      price: 219, category: 'Suits', sizes: ['XS','S','M','L','XL'],
      colors: [{name:'Plum',hex:'#7c2d4a'},{name:'Olive',hex:'#4d7c0f'}],
      isNew: false, trendingScore: 65,
    },
  ];

  const extraNames: Array<{ name: string; category: string; basePrice: number }> = [
    { name: 'Cape Lehenga', category: 'Bridal', basePrice: 829 },
    { name: 'Patiala Suit', category: 'Suits', basePrice: 199 },
    { name: 'Bandhgala Blazer', category: 'Bridal', basePrice: 449 },
    { name: 'Chanderi Saree', category: 'Sarees', basePrice: 399 },
    { name: 'Straight Cut Suit', category: 'Suits', basePrice: 169 },
    { name: 'Crop Top Lehenga', category: 'Bridal', basePrice: 599 },
    { name: 'Printed Palazzo Set', category: 'Suits', basePrice: 149 },
    { name: 'Organza Saree', category: 'Sarees', basePrice: 459 },
    { name: 'Embroidered Kurti', category: 'Suits', basePrice: 129 },
    { name: 'Reception Lehenga', category: 'Bridal', basePrice: 899 },
    { name: 'Silk Kurta Pajama', category: 'Suits', basePrice: 189 },
    { name: 'Tussar Saree', category: 'Sarees', basePrice: 349 },
    { name: 'A-Line Kurta', category: 'Suits', basePrice: 159 },
    { name: 'Indo-Western Gown', category: 'Bridal', basePrice: 649 },
    { name: 'Cotton Palazzo', category: 'Suits', basePrice: 139 },
    { name: 'Kanjivaram Saree', category: 'Sarees', basePrice: 629 },
    { name: 'Designer Anarkali', category: 'Suits', basePrice: 519 },
    { name: 'Velvet Sherwani', category: 'Bridal', basePrice: 759 },
    { name: 'Linen Kurta', category: 'Suits', basePrice: 119 },
    { name: 'Georgette Saree', category: 'Sarees', basePrice: 299 },
    { name: 'Floor-Length Gown', category: 'Bridal', basePrice: 559 },
    { name: 'Pashmina Shawl Suit', category: 'Suits', basePrice: 249 },
    { name: 'Chikankari Saree', category: 'Sarees', basePrice: 419 },
    { name: 'Brocade Sherwani', category: 'Bridal', basePrice: 799 },
  ];

  const colorPairs: Array<{ name: string; hex: string }> = [
    { name: 'Emerald', hex: '#0f766e' }, { name: 'Wine', hex: '#7c2d4a' },
    { name: 'Ivory', hex: '#f5f0e6' }, { name: 'Indigo', hex: '#1e3a8a' },
    { name: 'Blush', hex: '#f9a8b8' }, { name: 'Gold', hex: '#c9a55c' },
    { name: 'Crimson', hex: '#9f1239' }, { name: 'Royal', hex: '#4c1d95' },
    { name: 'Mustard', hex: '#d4a017' }, { name: 'Teal', hex: '#0d9488' },
    { name: 'Peach', hex: '#fbcfa8' }, { name: 'Mint', hex: '#a7f3d0' },
    { name: 'Plum', hex: '#7c2d4a' }, { name: 'Olive', hex: '#4d7c0f' },
    { name: 'Charcoal', hex: '#1f2937' }, { name: 'Sage', hex: '#9ca38f' },
  ];

  const allDummies = [...baseDummies];
  extraNames.forEach((extra, i) => {
    const idx = i + 9;
    allDummies.push({
      sku: `AN-${extra.category.slice(0, 2).toUpperCase()}-${extra.name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8)}-${String(idx).padStart(3, '0')}`,
      code: `NOVA-${String(idx).padStart(3, '0')}`,
      name: extra.name,
      description: `${extra.name} in premium fabric with fine handcraft detailing. A boutique signature piece.`,
      price: extra.basePrice,
      category: extra.category,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [colorPairs[i % colorPairs.length], colorPairs[(i + 5) % colorPairs.length]],
      isNew: i % 3 === 0,
      trendingScore: Math.max(30, 62 - i),
    });
  });

  await prisma.product.createMany({
    data: allDummies.map((d) => ({
      ...d,
      sizes: JSON.stringify(d.sizes),
      colors: JSON.stringify(d.colors),
      currency: 'USD',
      inStock: true,
    })),
  });
}
