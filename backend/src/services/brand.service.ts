import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { Brand } from '@prisma/client';
import type { BrandUpdateInput } from '../schemas/brand.schema';

/**
 * Brand service — storefront identity.
 *
 * The frontend reads the brand via `GET /api/brand` to render the HomePage
 * cover banner, logo, name, and tagline ("Try then Buy"). The admin portal
 * updates it via `PATCH /api/brand/:id`.
 *
 * All Prisma access goes through this service — routes never touch prisma
 * directly (Dependency Inversion + Single Responsibility).
 */

const svcLogger = logger.child({ service: 'brand' });

/** Shape returned to the frontend — matches the frontend's `Brand` type. */
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
  };
}

/**
 * Returns the active brand. If no brand row exists yet (fresh install), one is
 * seeded with sensible defaults so the frontend's HomePage is never empty.
 */
export async function getActiveBrand(): Promise<BrandDto> {
  let brand = await prisma.brand.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!brand) {
    svcLogger.info('No active brand found — seeding default brand record.');
    brand = await prisma.brand.create({
      data: {
        name: 'Atelier Nova',
        tagline: 'Try then Buy',
        primaryColor: '#1c1917',
        accentColor: '#d4a017',
        isActive: true,
      },
    });
  }

  return toDto(brand);
}

export async function updateBrand(
  id: string,
  patch: BrandUpdateInput,
): Promise<BrandDto> {
  const updated = await prisma.brand.update({
    where: { id },
    data: patch,
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
