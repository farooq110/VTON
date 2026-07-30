import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActivityLogEntry,
  Brand,
  BrandTryOnRequest,
  Product,
  ProductFilters,
  SavedCaptureImage,
  TryOnResult,
  TryOnSettings,
  User,
} from "@/types";
import { DEFAULT_SETTINGS, FALLBACK_BRAND } from "@/lib/constants";
import { EMPTY_FILTERS } from "@/types";
import { uid } from "@/lib/utils";

/**
 * Dummy person images — 3 stable Unsplash photos of people standing face-on.
 * Seeded into `savedImages` on first run so the captures gallery + camera
 * sidebar aren't empty before the user captures anything.
 */
const DUMMY_PERSON_IMAGES: string[] = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80",
];

/**
 * Dummy trending products — 32 garments with trending scores. Seeded into the
 * store when the backend is unreachable so the home rail is never empty.
 *
 * 32 items guarantees the user can scroll through at least 30 products on the
 * trending rail (the spec asks for "scroll up to 30"). The TrendingProducts
 * component cycles through these infinitely via IntersectionObserver, so the
 * rail never runs out.
 *
 * The first 8 are hand-crafted with rich descriptions; the remaining 24 are
 * generated programmatically with varied names, categories, and trending
 * scores so the rail looks organic.
 */
const DUMMY_BASE_PRODUCTS: Array<Omit<Product, "id">> = [
  { sku: "AN-SU-ANARKALI-001", code: "NOVA-001", name: "Anarkali Suit", description: "Floor-length Anarkali in flowy georgette with gold zari yoke.", price: 459, currency: "USD", category: "Suits", imageUrl: "", garmentOverlayUrl: "", sizes: ["XS","S","M","L","XL"], colors: [{name:"Emerald",hex:"#0f766e"},{name:"Wine",hex:"#7c2d4a"}], isNew: true, inStock: true, trendingScore: 92 },
  { sku: "AN-SK-SHALWAR-002", code: "NOVA-002", name: "Shalwar Kameez", description: "Classic three-piece in breathable cotton-silk with chikan embroidery.", price: 289, currency: "USD", category: "Suits", imageUrl: "", garmentOverlayUrl: "", sizes: ["S","M","L","XL"], colors: [{name:"Ivory",hex:"#f5f0e6"},{name:"Indigo",hex:"#1e3a8a"}], isNew: true, inStock: true, trendingScore: 88 },
  { sku: "AN-LE-LEHENGA-003", code: "NOVA-003", name: "Lehenga Choli", description: "Flared lehenga with all-over sequin and thread work.", price: 789, currency: "USD", category: "Bridal", imageUrl: "", garmentOverlayUrl: "", sizes: ["XS","S","M","L"], colors: [{name:"Blush",hex:"#f9a8b8"},{name:"Gold",hex:"#c9a55c"}], isNew: true, inStock: true, trendingScore: 85 },
  { sku: "AN-SA-SAREE-004", code: "NOVA-004", name: "Silk Saree", description: "Handloom Banarasi silk saree with broad gold border.", price: 549, currency: "USD", category: "Sarees", imageUrl: "", garmentOverlayUrl: "", sizes: ["Free Size"], colors: [{name:"Crimson",hex:"#9f1239"},{name:"Royal",hex:"#4c1d95"}], isNew: false, inStock: true, trendingScore: 79 },
  { sku: "AN-KS-KURTA-005", code: "NOVA-005", name: "Kurta Set", description: "Everyday kurta set in modal cotton with palazzo pants.", price: 179, currency: "USD", category: "Suits", imageUrl: "", garmentOverlayUrl: "", sizes: ["XS","S","M","L","XL","XXL"], colors: [{name:"Mustard",hex:"#d4a017"},{name:"Teal",hex:"#0d9488"}], isNew: true, inStock: true, trendingScore: 74 },
  { sku: "AN-SW-SHERWANI-006", code: "NOVA-006", name: "Sherwani", description: "Tailored sherwani in raw silk with mandarin collar.", price: 699, currency: "USD", category: "Bridal", imageUrl: "", garmentOverlayUrl: "", sizes: ["38","40","42","44","46"], colors: [{name:"Ivory",hex:"#f5f0e6"},{name:"Charcoal",hex:"#1f2937"}], isNew: false, inStock: true, trendingScore: 71 },
  { sku: "AN-PS-PALAZZO-007", code: "NOVA-007", name: "Palazzo Suit", description: "A-line short kurta with wide-leg palazzo pants.", price: 239, currency: "USD", category: "Suits", imageUrl: "", garmentOverlayUrl: "", sizes: ["S","M","L","XL"], colors: [{name:"Peach",hex:"#fbcfa8"},{name:"Mint",hex:"#a7f3d0"}], isNew: false, inStock: true, trendingScore: 68 },
  { sku: "AN-CK-CHURIDAR-008", code: "NOVA-008", name: "Churidar Kameez", description: "Slim-fit churidar kameez in viscose with gota patti.", price: 219, currency: "USD", category: "Suits", imageUrl: "", garmentOverlayUrl: "", sizes: ["XS","S","M","L","XL"], colors: [{name:"Plum",hex:"#7c2d4a"},{name:"Olive",hex:"#4d7c0f"}], isNew: false, inStock: true, trendingScore: 65 },
];

/** Extra generated products (24 more) so the trending rail can scroll past 30. */
const DUMMY_EXTRA_NAMES: Array<{ name: string; category: string; basePrice: number }> = [
  { name: "Cape Lehenga", category: "Bridal", basePrice: 829 },
  { name: "Patiala Suit", category: "Suits", basePrice: 199 },
  { name: "Bandhgala Blazer", category: "Bridal", basePrice: 449 },
  { name: "Chanderi Saree", category: "Sarees", basePrice: 399 },
  { name: "Straight Cut Suit", category: "Suits", basePrice: 169 },
  { name: "Crop Top Lehenga", category: "Bridal", basePrice: 599 },
  { name: "Printed Palazzo Set", category: "Suits", basePrice: 149 },
  { name: "Organza Saree", category: "Sarees", basePrice: 459 },
  { name: "Embroidered Kurti", category: "Suits", basePrice: 129 },
  { name: "Reception Lehenga", category: "Bridal", basePrice: 899 },
  { name: "Silk Kurta Pajama", category: "Suits", basePrice: 189 },
  { name: "Tussar Saree", category: "Sarees", basePrice: 349 },
  { name: "A-Line Kurta", category: "Suits", basePrice: 159 },
  { name: " Indo-Western Gown", category: "Bridal", basePrice: 649 },
  { name: "Cotton Palazzo", category: "Suits", basePrice: 139 },
  { name: "Kanjivaram Saree", category: "Sarees", basePrice: 629 },
  { name: "Designer Anarkali", category: "Suits", basePrice: 519 },
  { name: "Velvet Sherwani", category: "Bridal", basePrice: 759 },
  { name: "Linen Kurta", category: "Suits", basePrice: 119 },
  { name: "Georgette Saree", category: "Sarees", basePrice: 299 },
  { name: "Floor-Length Gown", category: "Bridal", basePrice: 559 },
  { name: "Pashmina Shawl Suit", category: "Suits", basePrice: 249 },
  { name: "Chikankari Saree", category: "Sarees", basePrice: 419 },
  { name: "Brocade Sherwani", category: "Bridal", basePrice: 799 },
];

const DUMMY_COLOR_PAIRS: Array<{ name: string; hex: string }> = [
  { name: "Emerald", hex: "#0f766e" }, { name: "Wine", hex: "#7c2d4a" },
  { name: "Ivory", hex: "#f5f0e6" }, { name: "Indigo", hex: "#1e3a8a" },
  { name: "Blush", hex: "#f9a8b8" }, { name: "Gold", hex: "#c9a55c" },
  { name: "Crimson", hex: "#9f1239" }, { name: "Royal", hex: "#4c1d95" },
  { name: "Mustard", hex: "#d4a017" }, { name: "Teal", hex: "#0d9488" },
  { name: "Peach", hex: "#fbcfa8" }, { name: "Mint", hex: "#a7f3d0" },
  { name: "Plum", hex: "#7c2d4a" }, { name: "Olive", hex: "#4d7c0f" },
  { name: "Charcoal", hex: "#1f2937" }, { name: "Sage", hex: "#9ca38f" },
];

/** Build the full 32-product dummy list (8 base + 24 generated). */
function buildDummyTrendingProducts(): Product[] {
  const result: Product[] = DUMMY_BASE_PRODUCTS.map((p, i) => ({ ...p, id: `p${i + 1}` }));
  DUMMY_EXTRA_NAMES.forEach((extra, i) => {
    const idx = i + 9;
    const colorA = DUMMY_COLOR_PAIRS[i % DUMMY_COLOR_PAIRS.length];
    const colorB = DUMMY_COLOR_PAIRS[(i + 5) % DUMMY_COLOR_PAIRS.length];
    result.push({
      id: `p${idx}`,
      sku: `AN-${extra.category.slice(0, 2).toUpperCase()}-${extra.name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8)}-${String(idx).padStart(3, "0")}`,
      code: `NOVA-${String(idx).padStart(3, "0")}`,
      name: extra.name.trim(),
      description: `${extra.name.trim()} in premium fabric with fine handcraft detailing. A boutique signature piece.`,
      price: extra.basePrice,
      currency: "USD",
      category: extra.category,
      imageUrl: "",
      garmentOverlayUrl: "",
      sizes: ["XS", "S", "M", "L", "XL"],
      colors: [colorA, colorB],
      isNew: i % 3 === 0,
      inStock: true,
      trendingScore: Math.max(30, 62 - i), // decreasing scores so the rail has variety
    });
  });
  return result;
}

const DUMMY_TRENDING_PRODUCTS: Product[] = buildDummyTrendingProducts();

/**
 * Global app store. Single source of truth for auth, brand, products,
 * saved captures, try-on results, brand tracking, settings and the debug
 * activity log.
 *
 * Async/I/O (camera, models, network) is delegated to dedicated hooks.
 */
interface AppState {
  // Auth
  user: User | null;
  isAuthed: boolean;
  setUser: (user: User | null) => void;
  signOut: () => void;

  // Brand + products
  brand: Brand;
  setBrand: (b: Brand) => void;
  setBrandCoverImage: (url: string | null) => void;
  setBrandName: (name: string | null) => void;
  setBrandLogo: (url: string | null) => void;
  products: Product[];
  setProducts: (p: Product[]) => void;
  /** Seed dummy trending products when the backend is unreachable. */
  seedDummyProducts: () => void;
  selectedProductId: string | null;
  selectProduct: (id: string | null) => void;
  productFilters: ProductFilters;
  setProductFilters: (patch: Partial<ProductFilters>) => void;
  resetProductFilters: () => void;

  // Captures
  savedImages: SavedCaptureImage[];
  addSavedImage: (img: SavedCaptureImage) => void;
  removeSavedImage: (id: string) => void;
  activeCaptureId: string | null;
  setActiveCapture: (id: string | null) => void;
  /** Seed 3 dummy person images so the captures gallery isn't empty on first run. */
  seedDummyCaptures: () => void;

  // Results + tracking
  lastResult: TryOnResult | null;
  setLastResult: (r: TryOnResult | null) => void;
  tryOnResults: TryOnResult[];
  addTryOnResult: (r: TryOnResult) => void;
  removeTryOnResult: (id: string) => void;
  brandRequests: BrandTryOnRequest[];
  trackBrandRequest: (req: Omit<BrandTryOnRequest, "id">) => void;

  // Activity log (debug overlay)
  activityLog: ActivityLogEntry[];
  logActivity: (
    entry: Omit<ActivityLogEntry, "id" | "timestamp" | "level"> &
      Partial<Pick<ActivityLogEntry, "id" | "timestamp" | "level">>,
  ) => void;
  clearActivityLog: () => void;

  // Settings
  settings: TryOnSettings;
  updateSettings: (patch: Partial<TryOnSettings>) => void;
  resetSettings: () => void;

  // Hydration flag — true once the persisted state is rehydrated from localStorage.
  _hydrated: boolean;
}

export const useAuthStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      isAuthed: false,
      setUser: (user) => set({ user, isAuthed: !!user }),
      signOut: () => {
        localStorage.removeItem("nova_token");
        set({ user: null, isAuthed: false, activeCaptureId: null, lastResult: null });
      },

      brand: FALLBACK_BRAND,
      setBrand: (brand) => set({ brand }),
      setBrandCoverImage: (url) =>
        set((s) => ({
          brand: {
            ...s.brand,
            customCoverBannerUrl: url === null ? undefined : url,
          },
        })),
      setBrandName: (name) =>
        set((s) => ({
          brand: {
            ...s.brand,
            customName: name === null ? undefined : name,
          },
        })),
      setBrandLogo: (url) =>
        set((s) => ({
          brand: {
            ...s.brand,
            customLogoUrl: url === null ? undefined : url,
          },
        })),
      products: [],
      // Defensive: always coerce to an array so downstream .filter/.map never
      // crash if the server (or a stale persisted store) returns a non-array.
      setProducts: (products) =>
        set({ products: Array.isArray(products) ? products : [] }),
      /** Seed 8 dummy trending products so the home rail isn't empty when the backend is offline. */
      seedDummyProducts: () =>
        set((s) => {
          if (s.products.length > 0) return s;
          return { products: DUMMY_TRENDING_PRODUCTS };
        }),
      selectedProductId: null,
      selectProduct: (id) => set({ selectedProductId: id }),
      productFilters: { ...EMPTY_FILTERS },
      setProductFilters: (patch) =>
        set((s) => ({ productFilters: { ...s.productFilters, ...patch } })),
      resetProductFilters: () => set({ productFilters: { ...EMPTY_FILTERS } }),

      savedImages: [],
      addSavedImage: (img) => set((s) => ({ savedImages: [img, ...s.savedImages].slice(0, 24) })),
      removeSavedImage: (id) => set((s) => ({ savedImages: s.savedImages.filter((i) => i.id !== id) })),
      activeCaptureId: null,
      setActiveCapture: (id) => set({ activeCaptureId: id }),
      /** Seed 3 dummy person images so the captures gallery isn't empty on first run. */
      seedDummyCaptures: () =>
        set((s) => {
          if (s.savedImages.length > 0) return s; // only seed when empty
          const now = Date.now();
          const dummies: SavedCaptureImage[] = DUMMY_PERSON_IMAGES.map((url, i) => ({
            id: `seed_cap_${i}`,
            dataUrl: url,
            thumbnailUrl: url,
            capturedAt: now - (i + 1) * 3600_000, // stagger by 1h each
            passedAllStages: true,
            sizeKb: 0,
          }));
          return { savedImages: dummies };
        }),

      lastResult: null,
      setLastResult: (r) => set({ lastResult: r }),
      tryOnResults: [],
      addTryOnResult: (r) =>
        set((s) => ({ tryOnResults: [r, ...s.tryOnResults].slice(0, 60) })),
      removeTryOnResult: (id) =>
        set((s) => ({ tryOnResults: s.tryOnResults.filter((r) => r.id !== id) })),
      brandRequests: [],
      trackBrandRequest: (req) =>
        set((s) => ({ brandRequests: [{ ...req, id: uid("req") }, ...s.brandRequests].slice(0, 200) })),

      activityLog: [],
      logActivity: (entry) =>
        set((s) => {
          // No-op when debug logging is disabled — prevents unbounded log
          // growth in production. The panel also self-gates on the same flag
          // (see ActivityLogPanel.tsx) so nothing is rendered either way.
          if (!s.settings.debugLogging) return s;
          return {
            activityLog: [
              {
                id: entry.id ?? uid("log"),
                timestamp: entry.timestamp ?? Date.now(),
                category: entry.category,
                label: entry.label,
                durationMs: entry.durationMs,
                detail: entry.detail,
                level: entry.level ?? "info",
              },
              ...s.activityLog,
            ].slice(0, 500),
          };
        }),
      clearActivityLog: () => set({ activityLog: [] }),

      settings: structuredClone(DEFAULT_SETTINGS),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetSettings: () => set({ settings: structuredClone(DEFAULT_SETTINGS) }),
      _hydrated: false,
    }),
    {
      name: "atelier-nova-tryon",
      partialize: (s) => ({
        user: s.user,
        isAuthed: s.isAuthed,
        savedImages: s.savedImages.slice(0, 8),
        settings: s.settings,
        brandRequests: s.brandRequests.slice(0, 50),
        tryOnResults: s.tryOnResults.slice(0, 30),
        activityLog: s.activityLog.slice(0, 100),
        brand: s.brand,
        productFilters: s.productFilters,
      }),
      // Track hydration so the app can show a loading screen until the
      // persisted state is fully rehydrated from localStorage. Without this,
      // the user briefly sees /signin before being redirected to /home.
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    },
  ),
);

// Convenience alias for non-auth consumers
export const useTryOnStore = useAuthStore;
