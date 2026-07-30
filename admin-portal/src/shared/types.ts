/**
 * Shared API types — these mirror the backend's response shape
 * (see backend/src/utils/response.ts) so both client and server can use them.
 *
 * Kept framework-agnostic on purpose: no React / fetch imports here.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  message?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export type SortDir = "asc" | "desc";

export const ERROR_CODES = {
  NO_API_KEY: "NO_API_KEY",
  NO_CREDITS: "NO_CREDITS",
  NO_PRICING_TIER: "NO_PRICING_TIER",
  FASHN_REJECTED: "FASHN_REJECTED",
  FASHN_ERROR: "FASHN_ERROR",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---- Entities ----------------------------------------------------------------

export type CustomerStatus = "ACTIVE" | "SUSPENDED" | "CHURNED" | "TRIAL";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  businessName: string;
  businessType: string | null;
  taxId: string | null;
  address: string | null;
  status: CustomerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    franchises?: number;
    apiKeys?: number;
    vtonRequests?: number;
    usages?: number;
    invoices?: number;
    notifications?: number;
  };
}

export interface Franchise {
  id: string;
  name: string;
  managerName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  customerId: string;
  customer?: Pick<Customer, "id" | "name" | "businessName">;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  keyHint: string;
  keyPrefix: string;
  defaultCredit: number;
  usedCredit: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PricingTier {
  id: string;
  customerId: string;
  startRange: number;
  endRange: number;
  priceCents: number;
  label: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VtonStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "queued";

export interface VtonRequest {
  id: string;
  customerId: string;
  franchiseId: string;
  status: VtonStatus;
  category: string;
  mode: string;
  modelImage: string;
  garmentImage: string;
  outputImages: string[] | null;
  errorMessage: string | null;
  creditsCost: number;
  createdAt: string;
  updatedAt: string;
  franchise?: Pick<Franchise, "id" | "name">;
  customer?: Pick<Customer, "id" | "name" | "businessName">;
}

export interface Usage {
  id: string;
  customerId: string;
  franchiseId: string | null;
  apiKeyId: string | null;
  creditsUsed: number;
  endpoint: string | null;
  day: string;
  createdAt: string;
  customer?: Pick<Customer, "id" | "name" | "businessName">;
  franchise?: Pick<Franchise, "id" | "name">;
}

export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationStatus = "read" | "unread";

export interface Notification {
  id: string;
  customerId: string | null;
  severity: NotificationSeverity;
  type: string;
  title: string;
  message: string;
  status: NotificationStatus;
  readAt: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivitySummary {
  totals: {
    customers: number;
    activeCustomers: number;
    franchises: number;
    apiKeys: number;
    activeApiKeys: number;
    vtonRequests: number;
    completedVtonRequests: number;
    pendingVtonRequests: number;
    failedVtonRequests: number;
    invoices: number;
    draftInvoices: number;
    sentInvoices: number;
    usageRecords: number;
    totalCreditsUsed: number;
  };
  byDay: Array<{ day: string; count: number; credits: number }>;
  byCustomer: Array<{
    customerId: string;
    customerName: string;
    businessName: string;
    count: number;
    credits: number;
  }>;
  byStatus: Array<{ status: string; count: number }>;
  last24h: {
    vtonRequests: number;
    usageRecords: number;
    completedVtonRequests: number;
    failedVtonRequests: number;
  };
}

export interface ActivityPeaks {
  days: number;
  peaks: Array<{ hour: number; count: number }>;
}
