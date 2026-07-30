import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  CheckSquare,
  Clock,
  Copy,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { canViewActivityLog } from "@/types";
import type { ActivityLogEntry } from "@/types";

/**
 * ActivityLogPanel — floating overlay that surfaces the debug activity log
 * when `settings.debugLogging` is enabled AND the user's role permits it
 * (manager / developer / super_admin — see `canViewActivityLog`).
 *
 * Ported from the Next.js preview's tryon/ActivityLogPanel.tsx and adapted
 * to use the frontend's `useAuthStore` + `@/components/ui/toast`.
 *
 * The overlay sits fixed at the bottom-right of the viewport. Tap the pill
 * to expand a card with the full log; each row can be copied, selected
 * (batch copy), or cleared. The log itself lives in the global store so it
 * survives route changes.
 */
export function ActivityLogPanel() {
  const debugLogging = useAuthStore((s) => s.settings.debugLogging);
  const user = useAuthStore((s) => s.user);
  const activityLog = useAuthStore((s) => s.activityLog);
  const clearLog = useAuthStore((s) => s.clearActivityLog);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  if (!debugLogging || !canViewActivityLog(user?.role)) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(activityLog.map((e) => e.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const formatEntry = (e: ActivityLogEntry): string =>
    `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.category.toUpperCase()} | ${e.label}${e.durationMs ? ` (${e.durationMs}ms)` : ""}${e.detail ? `\n  ${e.detail}` : ""}`;

  const copyAllLogs = () => {
    const text = activityLog.map(formatEntry).join("\n\n");
    navigator.clipboard
      .writeText(text)
      .then(() =>
        toast({ title: "All logs copied", description: `${activityLog.length} entries copied` }),
      );
  };

  const copySingleLog = (entry: ActivityLogEntry) => {
    navigator.clipboard.writeText(formatEntry(entry)).then(() => toast({ title: "Log entry copied" }));
  };

  const copySelected = () => {
    const selected = activityLog.filter((e) => selectedIds.has(e.id));
    const text = selected.map(formatEntry).join("\n\n");
    navigator.clipboard
      .writeText(text)
      .then(() =>
        toast({ title: "Logs copied", description: `${selected.length} entries copied` }),
      );
  };

  const deleteSelected = () => {
    clearLog();
    setSelectedIds(new Set());
    setSelectMode(false);
    toast({ title: "Logs deleted", description: `${selectedIds.size} entries removed` });
  };

  return (
    <>
      {!open && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 h-12 px-4 rounded-full bg-primary text-primary-foreground shadow-elevated flex items-center gap-2 text-sm font-medium"
        >
          <Activity className="h-4 w-4" />
          <span>Activity</span>
          <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded-full text-[10px]">
            {activityLog.length}
          </span>
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 left-0 right-0 z-40 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[480px] lg:rounded-2xl bg-card border border-border/60 shadow-elevated"
          >
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border/60 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-medium">Activity log</h3>
                <Badge className="text-[10px]">{activityLog.length}</Badge>
                {selectMode && selectedIds.size > 0 && (
                  <Badge className="text-[10px] bg-primary text-primary-foreground">
                    {selectedIds.size} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {selectMode ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs gap-1">
                      <CheckSquare className="h-3 w-3" /> All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 text-xs gap-1">
                      <Square className="h-3 w-3" /> None
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copySelected}
                      className="h-7 text-xs gap-1"
                      disabled={selectedIds.size === 0}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteSelected}
                      className="h-7 text-xs gap-1"
                      disabled={selectedIds.size === 0}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectMode(false);
                        setSelectedIds(new Set());
                      }}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectMode(true)}
                      className="h-8 gap-1.5 text-xs"
                      disabled={activityLog.length === 0}
                    >
                      <CheckSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Select</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyAllLogs}
                      className="h-8 gap-1.5 text-xs"
                      disabled={activityLog.length === 0}
                    >
                      <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copy all</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearLog} className="h-8 gap-1.5 text-xs">
                      <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Clear</span>
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[50vh] lg:h-[400px]">
              <div className="p-3 space-y-1.5">
                {activityLog.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    No activity logged yet.
                  </div>
                ) : (
                  activityLog.map((entry) => (
                    <LogRow
                      key={entry.id}
                      entry={entry}
                      onCopy={copySingleLog}
                      selectMode={selectMode}
                      selected={selectedIds.has(entry.id)}
                      onToggleSelect={() => toggleSelect(entry.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function LogRow({
  entry,
  onCopy,
  selectMode,
  selected,
  onToggleSelect,
}: {
  entry: ActivityLogEntry;
  onCopy: (e: ActivityLogEntry) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const levelColor = {
    info: "text-muted-foreground",
    warn: "text-amber-600",
    error: "text-destructive",
  }[entry.level];
  const categoryColor = {
    auth: "bg-primary/15 text-primary",
    navigation: "bg-blue-500/15 text-blue-700",
    capture: "bg-amber-500/15 text-amber-700",
    tryon: "bg-accent/20 text-accent-foreground",
    model: "bg-purple-500/15 text-purple-700",
    compression: "bg-teal-500/15 text-teal-700",
    network: "bg-rose-500/15 text-rose-700",
    settings: "bg-gray-500/15 text-gray-700",
    camera: "bg-indigo-500/15 text-indigo-700",
  }[entry.category];

  return (
    <div
      className={`group rounded-lg px-2 sm:px-3 py-2 text-xs overflow-hidden ${
        selected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40"
      }`}
    >
      <div className="flex items-start gap-2">
        {selectMode && (
          <button
            onClick={onToggleSelect}
            className="shrink-0 mt-0.5"
            aria-label={selected ? "Deselect" : "Select"}
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-medium ${categoryColor}`}
        >
          {entry.category}
        </span>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className={`font-medium ${levelColor} break-words`}>{entry.label}</p>
          {entry.detail && (
            <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed break-all whitespace-pre-wrap">
              {entry.detail}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
            {entry.durationMs !== undefined && (
              <span className="font-mono">· {formatDuration(entry.durationMs)}</span>
            )}
          </div>
        </div>
        {!selectMode && (
          <button
            onClick={() => onCopy(entry)}
            className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition opacity-0 group-hover:opacity-100"
            aria-label="Copy"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
