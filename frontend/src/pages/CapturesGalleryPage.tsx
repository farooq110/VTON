import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckSquare,
  Image as ImageIcon,
  LayoutGrid,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { AddCapturePanel } from "@/components/tryon/AddCapturePanel";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { formatBytes, formatRelativeTime, resolveProductImage, onImageError } from "@/lib/utils";
import type { SavedCaptureImage } from "@/types";

/**
 * CapturesGalleryPage — separate full-page view of all saved person images.
 *
 * Ported from the Next.js preview's tryon/CapturesGalleryScreen.tsx and
 * adapted to the frontend's react-router + useAuthStore stack. The
 * SavedCaptureCard (preview's camera/captures-sidebar) is inlined here so
 * the gallery + camera sidebar share the same per-card UI (preview +
 * delete + select-mode + fullscreen try-on confirmation).
 *
 * Spec:
 *   - "create separate page for per image list"
 *   - "In capture gallery should have interface for delete and preview image
 *      make consistent ui not generate new one"
 *
 * Reachable from: hamburger menu → "Captures gallery".
 */
export function CapturesGalleryPage() {
  const navigate = useNavigate();
  const savedImages = useAuthStore((s) => s.savedImages);
  const removeSavedImage = useAuthStore((s) => s.removeSavedImage);
  const setActiveCapture = useAuthStore((s) => s.setActiveCapture);
  const selectedProductId = useAuthStore((s) => s.selectedProductId);
  const products = useAuthStore((s) => s.products);
  const { toast } = useToast();

  const product = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  // The camera button in the captures gallery should simply open the camera
  // so the user can capture and upload a person's image. It does NOT require
  // a selected product — the user can capture a person photo here without
  // intending to try-on yet. The product requirement is enforced only when
  // the user clicks "Try on with this" on a saved image.
  const goToCamera = () => {
    navigate("/tryon/camera");
  };

  // Select mode — same pattern as the camera sidebar (consistent UI)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmImage, setConfirmImage] = useState<SavedCaptureImage | null>(null);

  // Lock the body's page scroll while the try-on confirmation modal is open.
  useBodyScrollLock(confirmImage !== null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(savedImages.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const deleteSelected = () => {
    selectedIds.forEach((id) => removeSavedImage(id));
    setSelectedIds(new Set());
    setSelectMode(false);
    toast({
      title: `Deleted ${selectedIds.size} ${selectedIds.size === 1 ? "image" : "images"}`,
    });
  };

  // Spec: "in person image when user click do no tryon directly first ask for
  // user to insure user want in modal with both garments and person image"
  // If no product is selected, show a toast but DON'T navigate away — the
  // user stays on the captures gallery page.
  const tryWithImage = (img: SavedCaptureImage) => {
    if (!product) {
      toast({
        title: "Select a product first",
        description: "Browse the collection and pick a garment to try on with this image.",
        variant: "destructive",
      });
      return; // stay on the page — don't navigate to /products
    }
    setConfirmImage(img);
  };

  const confirmTryOn = () => {
    if (!confirmImage) return;
    setActiveCapture(confirmImage.id);
    sessionStorage.setItem("nova_skip_stages", "true");
    setConfirmImage(null);
    navigate("/tryon/processing");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GlobalHeader
        title="Captures gallery"
        subtitle={`${savedImages.length} saved ${savedImages.length === 1 ? "image" : "images"} · skips pose validation`}
      />

      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        {savedImages.length === 0 ? (
          <EmptyState onOpenCamera={goToCamera} />
        ) : (
          <>
            {/* Toolbar — Add Image button is now beside Camera (in the page
                body, not the header). The AddCapturePanel modal opens as an
                overlay (fixed position) so it doesn't push page content. */}
            <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3 sm:p-4">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-display text-sm font-medium truncate">All captures</span>
                <Badge className="shrink-0 bg-secondary text-secondary-foreground">
                  {savedImages.length}
                </Badge>
                {selectMode && selectedIds.size > 0 && (
                  <Badge className="shrink-0 text-[10px] bg-primary text-primary-foreground">
                    {selectedIds.size} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                {selectMode ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={selectAll} className="h-8 text-xs gap-1">
                      <CheckSquare className="h-3.5 w-3.5" /> All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAll} className="h-8 text-xs gap-1">
                      <Square className="h-3.5 w-3.5" /> None
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteSelected}
                      className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                      disabled={selectedIds.size === 0}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectMode(false);
                        setSelectedIds(new Set());
                      }}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectMode(true)}
                      className="h-9 gap-1.5 text-xs"
                    >
                      <CheckSquare className="h-3.5 w-3.5" /> Select
                    </Button>
                    {/* Add Image button — beside Camera, in the page body.
                        The AddCapturePanel modal opens as a fixed overlay. */}
                    <AddCapturePanel />
                    <Button variant="outline" size="sm" onClick={goToCamera} className="h-9 gap-1.5 text-xs">
                      <Camera className="h-3.5 w-3.5" /> Camera
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Info banner */}
            <div className="mb-4 sm:mb-6 rounded-2xl bg-accent/10 border border-accent/20 p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground grid place-items-center shrink-0">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-medium">Saved images skip validation</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Hover a card to reveal <strong>preview</strong> and <strong>delete</strong> buttons.
                  Tap an image to try it on with the currently selected garment. Saved images go
                  directly to the TryOn AI — Stage 1, 2, 3 are skipped.
                </p>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {savedImages.map((img, idx) => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
                >
                  <SavedCaptureCard
                    img={img}
                    onUse={() => tryWithImage(img)}
                    onRemove={() => {
                      removeSavedImage(img.id);
                      toast({ title: "Image deleted" });
                    }}
                    selectMode={selectMode}
                    selected={selectedIds.has(img.id)}
                    onToggleSelect={() => toggleSelect(img.id)}
                  />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Confirmation dialog — "Try on with this image?"
          Shows BOTH garment + person image side by side, centered. */}
      <AnimatePresence>
        {confirmImage && product && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-foreground/70 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setConfirmImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card rounded-2xl shadow-elevated max-w-sm w-full overflow-hidden max-h-[85vh] overflow-y-auto overscroll-contain my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-3 bg-muted">
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-card">
                  <img
                    src={resolveProductImage(product)}
                    alt={product.name}
                    onError={(e) => onImageError(e, product.sku)}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute bottom-1 left-1 right-1 bg-foreground/70 backdrop-blur-md text-primary-foreground text-[9px] px-1.5 py-0.5 rounded text-center truncate">
                    {product.name}
                  </div>
                </div>
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-card">
                  <img
                    src={confirmImage.thumbnailUrl}
                    alt="Your capture"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute bottom-1 left-1 right-1 bg-foreground/70 backdrop-blur-md text-primary-foreground text-[9px] px-1.5 py-0.5 rounded text-center truncate">
                    Your photo
                  </div>
                </div>
              </div>
              <div className="p-5 text-center">
                <h3 className="font-display text-base font-medium">Try on with this image?</h3>
                <p className="text-xs text-muted-foreground mt-1.5">
                  This will skip validation and go directly to the TryOn AI with{" "}
                  <strong>{product.name}</strong>.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => setConfirmImage(null)} className="flex-1 h-11">
                    Cancel
                  </Button>
                  <Button onClick={confirmTryOn} className="flex-1 h-11 gap-2">
                    <Camera className="h-4 w-4" /> Yes, try on
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ onOpenCamera }: { onOpenCamera: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4 max-w-md mx-auto">
      <div className="h-16 w-16 rounded-full bg-accent/15 text-accent grid place-items-center mb-5">
        <ImageIcon className="h-7 w-7" />
      </div>
      <h2 className="font-display text-2xl font-medium">No saved captures yet</h2>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        Capture a photo with the camera, or use the &ldquo;Add image&rdquo; button in the toolbar
        to upload from your device or paste a URL. Saved images skip pose validation.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onOpenCamera} className="gap-2">
          <Camera className="h-4 w-4" /> Open camera
        </Button>
        <AddCapturePanel />
      </div>
    </div>
  );
}

/**
 * SavedCaptureCard — single saved capture tile. Inlined from the preview's
 * camera/captures-sidebar so the gallery + camera sidebar share the same
 * per-card UI (preview button, delete button, select-mode checkbox,
 * fullscreen try-on confirmation).
 */
function SavedCaptureCard({
  img,
  onUse,
  onRemove,
  selectMode,
  selected,
  onToggleSelect,
}: {
  img: SavedCaptureImage;
  onUse: () => void;
  onRemove: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [preview, setPreview] = useState(false);
  // Lock the body's page scroll while the fullscreen preview modal is open.
  useBodyScrollLock(preview);

  return (
    <>
      <div
        className={`group relative rounded-xl overflow-hidden border bg-card transition ${
          selected ? "border-primary ring-1 ring-primary/30" : "border-border/60"
        }`}
      >
        <button
          onClick={() => selectMode && onToggleSelect()}
          className="block w-full text-left"
          aria-label="Saved capture"
        >
          <div className="relative aspect-[3/4] bg-muted">
            <img
              src={img.thumbnailUrl}
              alt="Saved capture"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-primary-foreground opacity-0 group-hover:opacity-100 transition">
              <span>{formatRelativeTime(img.capturedAt)}</span>
              <span>{formatBytes(img.sizeKb)}</span>
            </div>
            {selectMode && (
              <div className="absolute top-2 right-2">
                {selected ? (
                  <CheckSquare className="h-6 w-6 text-primary" />
                ) : (
                  <Square className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        </button>

        {!selectMode && (
          <>
            <button
              onClick={() => setPreview(true)}
              className="absolute top-2 left-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition"
              aria-label="Preview image"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
              aria-label="Delete image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {!selectMode && (
          <Button
            size="sm"
            onClick={onUse}
            className="w-full rounded-none h-9 text-xs gap-1.5"
          >
            Try on with this
          </Button>
        )}
      </div>

      {/* Fullscreen preview — centered image + Try on + Close */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-foreground/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={() => setPreview(false)}
          >
            <button
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-foreground/40 text-primary-foreground grid place-items-center"
              aria-label="Close"
              onClick={() => setPreview(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div
              className="flex-1 relative w-full overflow-y-auto overscroll-contain"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={img.dataUrl}
                alt="Full preview"
                className="block max-w-full max-h-[80vh] object-contain mx-auto p-4"
              />
            </div>
            <div
              className="flex gap-2 justify-center pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="outline" onClick={() => setPreview(false)} className="gap-2">
                Close
              </Button>
              <Button
                onClick={() => {
                  setPreview(false);
                  onUse();
                }}
                className="gap-2"
              >
                <Camera className="h-4 w-4" /> Try on with this
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
