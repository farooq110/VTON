import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { Brand } from '@prisma/client';
import type { BrandUpdateInput } from '../schemas/brand.schema';

const svcLogger = logger.child({ service: 'brand' });

export interface BrandDto {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  coverBannerUrl: string | null;
  customName?: string | null;
  customLogoUrl?: string | null;
  customCoverBannerUrl?: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  isActive: boolean;
  franchiseId?: string | null;
}

function toDto(b: Brand): BrandDto {
  return {
    id: b.id,
    name: b.name,
    tagline: b.tagline,
    logoUrl: b.logoUrl,
    coverBannerUrl: b.coverBannerUrl,
    customName: b.customName,
    customLogoUrl: b.customLogoUrl,
    customCoverBannerUrl: b.customCoverBannerUrl,
    primaryColor: b.primaryColor,
    accentColor: b.accentColor,
    isActive: b.isActive,
    franchiseId: b.franchiseId,
  };
}

function stripNonDataFields(patch: BrandUpdateInput): Record<string, unknown> {
  const { id: _id, isActive: _isActive, ...dataFields } = patch;
  void _id;
  void _isActive;
  return dataFields;
}

/**
 * Issue 1 fix — returns the franchiseId from the request's authenticated user.
 */
function getFranchiseScope(req: { user?: { franchiseId?: string } | null }): string {
  return req.user?.franchiseId ?? 'global';
}

/**
 * Issue 1 fix — returns the brand for the user's franchise.
 * If no brand row exists for this franchise, one is seeded with defaults.
 */
export async function getActiveBrand(req: { user?: { franchiseId?: string } | null }): Promise<BrandDto> {
  const franchiseId = getFranchiseScope(req);
  let brand = await prisma.brand.findFirst({
    where: { franchiseId },
    orderBy: { createdAt: 'asc' },
  });

  if (!brand) {
    // Fallback: try any active brand (for backward compat with pre-franchise data).
    brand = await prisma.brand.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!brand) {
    svcLogger.info({ franchiseId }, 'No brand found — seeding default brand');
    brand = await prisma.brand.create({
      data: {
        name: 'Atelier Nova',
        tagline: 'Try then Buy',
        primaryColor: '#1c1917',
        accentColor: '#d4a017',
        isActive: true,
        franchiseId,
      },
    });
  }

  return toDto(brand);
}

export async function updateBrand(
  id: string,
  patch: BrandUpdateInput,
): Promise<BrandDto> {
  const data = stripNonDataFields(patch);
  const updated = await prisma.brand.update({
    where: { id },
    data,
  });
  svcLogger.info({ brandId: id }, 'brand updated');
  return toDto(updated);
}

export async function listBrands(): Promise<BrandDto[]> {
  const brands = await prisma.brand.findMany({
    orderBy: { createdAt: 'asc' },
  });
  return brands.map(toDto);
}

/**
 * Issue 1 fix — upserts the brand for the user's franchise.
 */
export async function upsertActiveBrand(
  req: { user?: { franchiseId?: string } | null },
  patch: BrandUpdateInput,
): Promise<BrandDto> {
  const franchiseId = getFranchiseScope(req);
  const data = stripNonDataFields(patch);

  let brand = await prisma.brand.findFirst({
    where: { franchiseId },
    orderBy: { createdAt: 'asc' },
  });

  if (!brand) {
    // Fallback: try any active brand.
    brand = await prisma.brand.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: (data.name as string) ?? 'Atelier Nova',
        tagline: (data.tagline as string) ?? 'Try then Buy',
        logoUrl: (data.logoUrl as string | null) ?? null,
        coverBannerUrl: (data.coverBannerUrl as string | null) ?? null,
        customName: (data.customName as string | null) ?? null,
        customLogoUrl: (data.customLogoUrl as string | null) ?? null,
        customCoverBannerUrl: (data.customCoverBannerUrl as string | null) ?? null,
        primaryColor: (data.primaryColor as string | null) ?? '#1c1917',
        accentColor: (data.accentColor as string | null) ?? '#d4a017',
        isActive: true,
        franchiseId,
      },
    });
    svcLogger.info({ brandId: brand.id, franchiseId }, 'brand created (upsert)');
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data,
    });
    svcLogger.info({ brandId: brand.id, franchiseId }, 'brand updated (upsert)');
  }

  return toDto(brand);
}

export async function clearCustomLogo(req: { user?: { franchiseId?: string } | null }): Promise<BrandDto> {
  const franchiseId = getFranchiseScope(req);
  let brand = await prisma.brand.findFirst({
    where: { franchiseId },
    orderBy: { createdAt: 'asc' },
  });
  if (!brand) {
    brand = await prisma.brand.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!brand) throw new Error('No active brand found');
  const updated = await prisma.brand.update({
    where: { id: brand.id },
    data: { customLogoUrl: null },
  });
  svcLogger.info({ brandId: brand.id }, 'custom logo cleared');
  return toDto(updated);
}

export async function clearCustomCover(req: { user?: { franchiseId?: string } | null }): Promise<BrandDto> {
  const franchiseId = getFranchiseScope(req);
  let brand = await prisma.brand.findFirst({
    where: { franchiseId },
    orderBy: { createdAt: 'asc' },
  });
  if (!brand) {
    brand = await prisma.brand.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!brand) throw new Error('No active brand found');
  const updated = await prisma.brand.update({
    where: { id: brand.id },
    data: { customCoverBannerUrl: null },
  });
  svcLogger.info({ brandId: brand.id }, 'custom cover cleared');
  return toDto(updated);
}
