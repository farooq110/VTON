import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckSquare,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { formatRelativeTime } from "@/lib/utils";
import type { TryOnResult } from "@/types";

/**
 * ResultsGalleryPage — full-page gallery of every past try-on result
 * composite.
 *
 * Ported from the Next.js preview's tryon/ResultsGalleryScreen.tsx and
 * adapted to the frontend's react-router + useAuthStore stack. Mirrors the
 * CapturesGalleryPage UX (grid + select mode + delete + fullscreen
 * preview) but operates on `tryOnResults` (the AI-generated composites)
 * rather than `savedImages` (the person captures).
 *
 * Reachable from: hamburger menu → "Try-on results".
 */
export function ResultsGalleryPage() {
  const tryOnResults = useAuthStore((s) => s.tryOnResults);
  const removeTryOnResult = useAuthStore((s) => s.removeTryOnResult);
  const { toast } = useToast();

  // Select mode — same pattern as CapturesGalleryPage for consistency.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<TryOnResult | null>(null);

  // Lock the body scroll while the fullscreen preview modal is open.
  useBodyScrollLock(previewResult !== null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(tryOnResults.map((r) => r.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const deleteSelected = () => {
    selectedIds.forEach((id) => removeTryOnResult(id));
    toast({
      title: `Deleted ${selectedIds.size} ${selectedIds.size === 1 ? "result" : "results"}`,
    });
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GlobalHeader
        title="Try-on results"
        subtitle={`${tryOnResults.length} saved ${tryOnResults.length === 1 ? "result" : "results"} · composites from past sessions`}
      />

      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        {tryOnResults.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Toolbar */}
            <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3 sm:p-4">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-display text-sm font-medium truncate">All results</span>
                <Badge className="shrink-0 bg-secondary text-secondary-foreground">
                  {tryOnResults.length}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectMode(true)}
                    className="h-9 gap-1.5 text-xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" /> Select
                  </Button>
                )}
              </div>
            </div>

            {/* Info banner */}
            <div className="mb-4 sm:mb-6 rounded-2xl bg-accent/10 border border-accent/20 p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground grid place-items-center shrink-0">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-medium">Your try-on history</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Every composite your boutique generates is stored here. Hover a card to{" "}
                  <strong>preview</strong> fullscreen or <strong>delete</strong> it. Tap an image to
                  open it large.
                </p>
              </div>
            </div>

            {/* Grid of result composites */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {tryOnResults.map((result, idx) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
                >
                  <ResultCard
                    result={result}
                    onPreview={() => setPreviewResult(result)}
                    onRemove={() => {
                      removeTryOnResult(result.id);
                      toast({ title: "Result deleted" });
                    }}
                    selectMode={selectMode}
                    selected={selectedIds.has(result.id)}
                    onToggleSelect={() => toggleSelect(result.id)}
                  />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Fullscreen preview modal */}
      <AnimatePresence>
        {previewResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-foreground/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={() => setPreviewResult(null)}
          >
            <button
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-foreground/40 text-primary-foreground grid place-items-center hover:bg-foreground/60 z-10"
              aria-label="Close"
              onClick={() => setPreviewResult(null)}
            >
              <X className="h-5 w-5" />
            </button>
            <div
              className="flex-1 relative w-full overflow-y-auto overscroll-contain"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewResult.imageUrl}
                alt={`Try-on result ${previewResult.productSku}`}
                className="block max-w-full max-h-[80vh] object-contain mx-auto p-4"
              />
              <div className="text-center pb-4">
                <p className="text-primary-foreground font-display text-sm">
                  {previewResult.productSku}
                </p>
                <p className="text-primary-foreground/60 text-xs mt-0.5">
                  {formatRelativeTime(previewResult.createdAt)}
                </p>
              </div>
            </div>
            <div
              className="flex gap-2 justify-center pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                onClick={() => setPreviewResult(null)}
                className="gap-2 text-primary-foreground border-primary-foreground/30 hover:bg-foreground/20 hover:text-primary-foreground"
              >
                Close
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  removeTryOnResult(previewResult.id);
                  setPreviewResult(null);
                  toast({ title: "Result deleted" });
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * ResultCard — single try-on result tile. Mirrors SavedCaptureCard's
 * affordances (preview button, delete button, select-mode checkbox) so the
 * two galleries feel like the same surface.
 */
function ResultCard({
  result,
  onPreview,
  onRemove,
  selectMode,
  selected,
  onToggleSelect,
}: {
  result: TryOnResult;
  onPreview: () => void;
  onRemove: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl overflow-hidden border bg-card transition ${
        selected ? "border-primary ring-1 ring-primary/30" : "border-border/60"
      }`}
    >
      <button
        onClick={() => (selectMode ? onToggleSelect() : onPreview())}
        className="block w-full text-left"
        aria-label={`Preview result ${result.productSku}`}
      >
        <div className="relative aspect-[3/4] bg-muted">
          <img
            src={result.imageUrl}
            alt={`Try-on result ${result.productSku}`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
          {/* SKU + timestamp footer */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/85 to-transparent p-2 pt-6">
            <p className="font-mono text-[10px] text-primary-foreground truncate">
              {result.productSku}
            </p>
            <p className="text-[9px] text-primary-foreground/70">
              {formatRelativeTime(result.createdAt)}
            </p>
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
            onClick={onPreview}
            className="absolute top-2 left-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition"
            aria-label="Preview result"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
            aria-label="Delete result"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {!selectMode && (
        <div className="px-2 py-1.5 bg-card border-t border-border/60">
          <p className="font-mono text-[10px] truncate flex items-center gap-1">
            <Check className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">{result.productSku}</span>
            <span className="ml-auto text-muted-foreground text-[9px]">
              {formatRelativeTime(result.createdAt)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4 max-w-md mx-auto">
      <div className="h-16 w-16 rounded-full bg-accent/15 text-accent grid place-items-center mb-5">
        <ImageIcon className="h-7 w-7" />
      </div>
      <h2 className="font-display text-2xl font-medium">No try-on results yet</h2>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        Once you complete a try-on session, the generated composite will appear here. Browse the
        collection and try a piece on to get started.
      </p>
    </div>
  );
}
