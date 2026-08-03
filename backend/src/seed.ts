import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptApiKey, generateApiKey } from './lib/crypto';
import { logger } from './lib/logger';
import { seedDummyProductsIfEmpty } from './services/product.service';

/**
 * Seed script.
 *
 * Creates:
 *   1. A portal admin user (admin@admin-portal.local / admin12345)
 *   2. 4 boutique demo admins (the "tap to fill" rows on the boutique
 *      SignInPage — super_admin / developer / manager / public_user). These
 *      MUST match the credentials shown in
 *      `frontend/src/pages/SignInPage.tsx` or the demo buttons won't work.
 *   3. Default brand (Atelier Nova) + 8 dummy products
 *   4. 5 demo customers, each with:
 *        - 2 franchises
 *        - 1 active API key
 *        - 3 pricing tiers
 *        - 30 days of random usage records
 *        - 2-3 notifications
 *        - 1 VTON request (status: pending — no real FASHN call)
 *        - 1 invoice (DRAFT) for last month
 */

const prisma = new PrismaClient();

function log(msg: string, extra?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`🌱 ${msg}`, extra ?? '');
}

/**
 * Boutique demo admins — these are the 4 "tap to fill" rows shown on the
 * boutique frontend's SignInPage (`frontend/src/pages/SignInPage.tsx`).
 *
 * Keep this list IN SYNC with the `DemoRow` entries on the sign-in page.
 * If you change a credential here, change it there too (and vice-versa).
 *
 * Roles:
 *   - super_admin → can access Settings + edit brand + edit features
 *   - developer   → can access Settings + edit features (models, thresholds)
 *   - manager     → can access Settings + edit brand (cover, name, logo)
 *   - public_user → kiosk user, no Settings access, no Sign out button
 */
const BOUTIQUE_DEMO_ADMINS: Array<{
  email: string;
  name: string;
  password: string;
  role: string;
}> = [
  { email: 'admin@atelier.nova',       name: 'Atelier Super Admin', password: 'admin123',   role: 'super_admin' },
  { email: 'developer@atelier.nova',   name: 'Atelier Developer',   password: 'dev123',     role: 'developer'   },
  { email: 'nyc.manager@atelier.nova', name: 'NYC Franchise Manager', password: 'manager123', role: 'manager'   },
  { email: 'nyc.user@atelier.nova',    name: 'NYC Public User',     password: 'user123',    role: 'public_user' },
];

async function main(): Promise<void> {
  log('Seeding database…');

  // --- Portal admin (admin-portal.local) ---------------------------------
  const passwordHash = await bcrypt.hash('admin12345', 12);
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@admin-portal.local' },
    update: {},
    create: {
      email: 'admin@admin-portal.local',
      name: 'Portal Admin',
      passwordHash,
      role: 'ADMIN',
    },
  });
  log('Admin user ready', { id: admin.id, email: admin.email });

  // --- Boutique demo admins (the "tap to fill" rows on SignInPage) -------
  // These credentials are shown verbatim on the boutique frontend's sign-in
  // page. They must exist in the DB or the demo buttons will fail with 401.
  for (const demo of BOUTIQUE_DEMO_ADMINS) {
    const hash = await bcrypt.hash(demo.password, 12);
    const row = await prisma.admin.upsert({
      where: { email: demo.email },
      update: { passwordHash: hash, role: demo.role, name: demo.name },
      create: {
        email: demo.email,
        name: demo.name,
        passwordHash: hash,
        role: demo.role,
      },
    });
    log(`Boutique demo admin ready`, { email: row.email, role: row.role });
  }

  // --- Brand (storefront identity for the boutique frontend) -------------
  const existingBrand = await prisma.brand.findFirst({ where: { isActive: true } });
  let brandId: string;
  if (!existingBrand) {
    const brand = await prisma.brand.create({
      data: {
        name: 'Atelier Nova',
        tagline: 'Try then Buy',
        primaryColor: '#1c1917',
        accentColor: '#d4a017',
        isActive: true,
      },
    });
    brandId = brand.id;
    log('Brand seeded (Atelier Nova)');
  } else {
    brandId = existingBrand.id;
    log('Brand already exists, skipping seed');
  }

  // --- Settings (app-wide settings for the active brand) -----------------
  // Issue 3 fix — seed the Setting row with the UI's default values so
  // GET /api/settings returns the correct defaults on first load (currency
  // PKR, theme colors, model IDs, thresholds, compression, etc.).
  const existingSettings = await prisma.setting.findUnique({
    where: { brandId },
  });
  if (!existingSettings) {
    await prisma.setting.create({
      data: {
        brandId,
        currency: 'PKR',
        priceRangeMin: 0,
        priceRangeMax: 10000,
        personDetectionModelId: 'yolov8n-pose',
        postureModelId: 'yolov8n-pose',
        poseThresholds: JSON.stringify({
          personScore: 0.6,
          shoulderTiltDeg: 12,
          faceYawDeg: 18,
          facePitchDeg: 15,
          minBodyVisibility: 0.55,
        }),
        personDetectionParams: JSON.stringify({
          confidenceThreshold: 0.6,
          nmsIouThreshold: 0.5,
          maxPersons: 10,
        }),
        compression: JSON.stringify({
          maxFileSizeKb: 1000,
          minQuality: 0.7,
          qualityStep: 0.05,
          dimensionStep: 0.05,
          stripMetadata: true,
          stripChunks: true,
        }),
        captureTimerSeconds: 3,
        taglineRefreshMs: 2400,
        productTapBehavior: 'expand',
        debugLogging: false,
        telemetryEnabled: false,
        autoPreloadModel: false,
        themePrimaryColor: '#7c2d4a',
        themeAccentColor: '#c9a55c',
        themeBackgroundColor: '#faf8f5',
        themeFontFamily: 'serif',
        themeBaseFontSize: 'base',
      },
    });
    log('Settings seeded (UI defaults: PKR currency, Plum Boutique theme, YOLOv8n-pose models)');
  } else {
    log('Settings already exist, skipping seed');
  }

  // --- Products (dummy catalog so the boutique UI isn't empty) ----------
  await seedDummyProductsIfEmpty();
  log('Products seeded (if empty)');

  // --- Demo customers ----------------------------------------------------
  const demoData: Array<{
    name: string;
    email: string;
    businessName: string;
    businessType: string;
    status: string;
  }> = [
    {
      name: 'Alex Morgan',
      email: 'alex@fashionretail.co',
      businessName: 'Fashion Retail Co.',
      businessType: 'Retail',
      status: 'ACTIVE',
    },
    {
      name: 'Priya Sharma',
      email: 'priya@stylehouse.com',
      businessName: 'Style House',
      businessType: 'Boutique',
      status: 'ACTIVE',
    },
    {
      name: 'James Chen',
      email: 'james@urbanthreads.io',
      businessName: 'Urban Threads',
      businessType: 'E-commerce',
      status: 'ACTIVE',
    },
    {
      name: 'Sofia Rossi',
      email: 'sofia@boutiqueitalia.it',
      businessName: 'Boutique Italia',
      businessType: 'Boutique',
      status: 'TRIAL',
    },
    {
      name: 'Marcus Johnson',
      email: 'marcus@trendsetters.com',
      businessName: 'Trendsetters Inc.',
      businessType: 'Retail Chain',
      status: 'SUSPENDED',
    },
  ];

  let customerIndex = 0;
  for (const d of demoData) {
    customerIndex += 1;
    log(`Creating customer ${customerIndex}/${demoData.length}: ${d.businessName}`);

    const customer = await prisma.customer.upsert({
      where: { email: d.email },
      update: {},
      create: {
        name: d.name,
        email: d.email,
        phone: `+1-555-010${customerIndex}`,
        businessName: d.businessName,
        businessType: d.businessType,
        taxId: `TAX-${1000 + customerIndex}`,
        address: `${customerIndex} Market Street, San Francisco, CA`,
        status: d.status,
        notes: customerIndex === 1 ? 'Top customer — primary account.' : null,
      },
    });

    // 2 franchises per customer
    const franchiseNames = [
      ['Downtown Flagship', 'Downtown Store Manager'],
      ['Westside Outlet', 'Westside Store Manager'],
    ];
    for (const [fname, mgr] of franchiseNames) {
      await prisma.franchise.create({
        data: {
          name: `${d.businessName.split(' ')[0]} ${fname}`,
          email: `franchise+${customerIndex}@${d.email.split('@')[1]}`,
          phone: `+1-555-020${customerIndex}`,
          managerName: mgr,
          address: `${customerIndex} Market Street, San Francisco, CA`,
          status: 'ACTIVE',
          customerId: customer.id,
        },
      });
    }

    // 1 active API key per customer
    const plaintextKey = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        keyEncrypted: encryptApiKey(plaintextKey),
        keyHint: `${plaintextKey.slice(0, 8)}…${plaintextKey.slice(-4)}`,
        keyPrefix: plaintextKey.slice(0, 12),
        customerId: customer.id,
        defaultCredit: 280,
        usedCredit: Math.floor(Math.random() * 100),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    // 3 pricing tiers (progressive)
    await prisma.customerPricing.createMany({
      data: [
        {
          customerId: customer.id,
          startRange: 1,
          endRange: 100,
          priceCents: 4900, // $49 flat
          label: 'Starter',
          active: true,
        },
        {
          customerId: customer.id,
          startRange: 101,
          endRange: 500,
          priceCents: 14900, // $149 flat
          label: 'Growth',
          active: true,
        },
        {
          customerId: customer.id,
          startRange: 501,
          endRange: 2000,
          priceCents: 39900, // $399 flat
          label: 'Scale',
          active: true,
        },
      ],
    });

    // Random usage records for last 30 days
    const usageRecords: Array<{
      customerId: string;
      franchiseId: string | null;
      apiKeyId: string;
      creditsUsed: number;
      endpoint: string;
      method: string;
      statusCode: number;
      day: Date;
    }> = [];
    const franchises = await prisma.franchise.findMany({
      where: { customerId: customer.id },
      select: { id: true },
    });
    const now = new Date();
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const recordsForDay = Math.floor(Math.random() * 8) + 1;
      for (let i = 0; i < recordsForDay; i++) {
        const day = new Date(now);
        day.setUTCDate(day.getUTCDate() - dayOffset);
        day.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
        usageRecords.push({
          customerId: customer.id,
          franchiseId: franchises[Math.floor(Math.random() * franchises.length)].id,
          apiKeyId: apiKey.id,
          creditsUsed: Math.floor(Math.random() * 3) + 1,
          endpoint: '/v1/run',
          method: 'POST',
          statusCode: 200,
          day,
        });
      }
    }
    await prisma.usage.createMany({ data: usageRecords });

    // Notifications
    await prisma.notification.createMany({
      data: [
        {
          customerId: customer.id,
          type: 'WELCOME',
          title: 'Welcome aboard!',
          message: `Hi ${d.name}, your account is set up. Start by adding franchises and API keys.`,
          severity: 'INFO',
          read: true,
        },
        {
          customerId: customer.id,
          type: 'USAGE_ALERT',
          title: 'Usage milestone reached',
          message: 'Your account has crossed 50 VTON requests this month.',
          severity: 'WARN',
          read: customerIndex % 2 === 0,
        },
      ],
    });

    // 1 VTON request (pending — no real FASHN call)
    await prisma.vtonRequest.create({
      data: {
        apiKeyId: apiKey.id,
        customerId: customer.id,
        franchiseId: franchises[0].id,
        fashnId: null,
        inputsHash: 'seed-' + customer.id,
        status: 'pending',
        inputs: JSON.stringify([
          {
            model_image: 'https://example.com/model.jpg',
            garment_image: 'https://example.com/garment.jpg',
          },
        ]),
        creditsUsed: 0,
      },
    });

    // 1 invoice for last month (DRAFT) — upsert so re-running the seed
    // doesn't crash on the unique `invoiceNumber` constraint. Idempotent.
    const periodStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const periodEnd = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59);
    const totalCredits = usageRecords.reduce((s, r) => s + r.creditsUsed, 0);
    const invoiceNumber = `INV-${periodStart.getUTCFullYear()}${String(
      periodStart.getUTCMonth() + 1,
    ).padStart(2, '0')}-${String(customerIndex).padStart(4, '0')}`;
    await prisma.invoice.upsert({
      where: { invoiceNumber },
      update: {
        // On re-run, refresh the totals so the invoice reflects the latest
        // seeded usage records.
        totalCredits,
        lineItems: JSON.stringify([
          {
            type: 'flat',
            tierLabel: 'Starter',
            startRange: 1,
            endRange: 100,
            credits: totalCredits,
            priceCents: 4900,
            priceFormatted: '$49.00',
          },
        ]),
        totals: JSON.stringify({
          subtotalCents: 4900,
          currency: 'USD',
          currencyCode: 'USD',
          totalFormatted: '$49.00',
          requestCount: usageRecords.length,
          totalCredits,
        }),
      },
      create: {
        customerId: customer.id,
        invoiceNumber,
        status: 'DRAFT',
        periodStart,
        periodEnd,
        totalCredits,
        lineItems: JSON.stringify([
          {
            type: 'flat',
            tierLabel: 'Starter',
            startRange: 1,
            endRange: 100,
            credits: totalCredits,
            priceCents: 4900,
            priceFormatted: '$49.00',
          },
        ]),
        totals: JSON.stringify({
          subtotalCents: 4900,
          currency: 'USD',
          currencyCode: 'USD',
          totalFormatted: '$49.00',
          requestCount: usageRecords.length,
          totalCredits,
        }),
        notes: 'Auto-generated by seed script',
      },
    });
  }

  log('✅ Seed complete!');
  log('   Admin login: admin@admin-portal.local / admin12345');
  log(`   Created ${demoData.length} customers with franchises, API keys, usage, pricing, notifications, VTON requests, and invoices.`);

  logger.info('seed complete');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', err);
    logger.fatal({ err: (err as Error).message }, 'seed failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
