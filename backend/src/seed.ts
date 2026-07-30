import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptApiKey, generateApiKey } from './lib/crypto';
import { logger } from './lib/logger';

/**
 * Seed script.
 *
 * Creates:
 *   1. An admin user (admin@admin-portal.local / admin12345)
 *   2. 5 demo customers, each with:
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

async function main(): Promise<void> {
  log('Seeding database…');

  // --- Admin -------------------------------------------------------------
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

    // 1 invoice for last month (DRAFT)
    const periodStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const periodEnd = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59);
    const totalCredits = usageRecords.reduce((s, r) => s + r.creditsUsed, 0);
    const invoiceNumber = `INV-${periodStart.getUTCFullYear()}${String(
      periodStart.getUTCMonth() + 1,
    ).padStart(2, '0')}-${String(customerIndex).padStart(4, '0')}`;
    await prisma.invoice.create({
      data: {
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
