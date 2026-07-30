import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { queue } from '../lib/queue';
import { calculateBillingForCustomer } from './pricing.service';
import type { GenerateInvoiceInput } from '../schemas/invoice.schema';
import type { PaginationParams } from '../types';

const svcLogger = logger.child({ service: 'invoice' });

export interface InvoiceListParams extends PaginationParams {
  customerId?: string;
  status?: string;
}

// -------------------------------------------------------------------------- //
// Invoice number generator: INV-YYYYMM-NNNN
// -------------------------------------------------------------------------- //

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const prefix = `INV-${yyyy}${mm}-`;

  // Find the highest existing invoice number with this prefix this month.
  const latest = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('-');
    const last = Number(parts[parts.length - 1]);
    if (!Number.isNaN(last)) next = last + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

// -------------------------------------------------------------------------- //
// Generate invoice
// -------------------------------------------------------------------------- //

export async function generateInvoice(input: GenerateInvoiceInput) {
  const { customerId, periodStart, periodEnd, currency, currencyCode, notes } = input;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      pricingTiers: {
        where: { active: true },
        orderBy: { startRange: 'asc' },
      },
    },
  });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  // Aggregate usage for the period
  const usageAgg = await prisma.usage.aggregate({
    where: {
      customerId,
      day: { gte: periodStart, lte: periodEnd },
    },
    _sum: { creditsUsed: true },
    _count: { _all: true },
  });

  const totalCredits = usageAgg._sum.creditsUsed ?? 0;
  const requestCount = usageAgg._count._all;

  // Calculate billing — throws NO_PRICING_TIER if no tiers
  const billing = await calculateBillingForCustomer(
    customerId,
    totalCredits,
    currency,
    currencyCode,
  );

  const invoiceNumber = await generateInvoiceNumber();

  const lineItems = [
    ...billing.lineItems,
    {
      type: 'summary',
      label: 'Total requests in period',
      requestCount,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  ];

  const totals = {
    ...billing.totals,
    requestCount,
    totalCredits,
  };

  const invoice = await prisma.invoice.create({
    data: {
      customerId,
      invoiceNumber,
      status: 'DRAFT',
      periodStart,
      periodEnd,
      totalCredits,
      lineItems: JSON.stringify(lineItems),
      totals: JSON.stringify(totals),
      notes: notes ?? null,
    },
    include: {
      customer: { select: { id: true, name: true, email: true, businessName: true } },
    },
  });

  // Enqueue background PDF generation (BullMQ no-ops if Redis unavailable).
  await queue.enqueueInvoice({
    invoiceId: invoice.id,
    customerId,
    action: 'generate-pdf',
  });

  svcLogger.info(
    { invoiceId: invoice.id, invoiceNumber, customerId, totalCredits, subtotalCents: totals.subtotalCents },
    'invoice generated',
  );

  return {
    ...invoice,
    lineItems,
    totals,
  };
}

export async function listInvoices(params: InvoiceListParams) {
  const where: Record<string, unknown> = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.status) where.status = params.status;

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        customer: {
          select: { id: true, name: true, email: true, businessName: true },
        },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  // Parse lineItems + totals back to objects for convenience
  const parsed = items.map((inv) => ({
    ...inv,
    lineItems: safeParse(inv.lineItems),
    totals: safeParse(inv.totals),
  }));

  return { items: parsed, total, page: params.page, pageSize: params.pageSize };
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, email: true, businessName: true, address: true, taxId: true },
      },
    },
  });
  if (!invoice) {
    throw new Error('NOT_FOUND: Invoice not found');
  }
  return {
    ...invoice,
    lineItems: safeParse(invoice.lineItems),
    totals: safeParse(invoice.totals),
  };
}

export async function markInvoiceSent(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    throw new Error('NOT_FOUND: Invoice not found');
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      status: 'SENT',
      sentToCustomer: true,
      sentAt: new Date(),
    },
  });

  // Enqueue email send (BullMQ no-ops if Redis unavailable).
  await queue.enqueueEmail({
    to: (await prisma.customer.findUnique({
      where: { id: invoice.customerId },
      select: { email: true },
    }))?.email,
    subject: `Invoice ${invoice.invoiceNumber}`,
    template: 'invoice-sent',
    data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
  });

  svcLogger.info({ invoiceId: id }, 'invoice marked sent');
  return updated;
}

function safeParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
