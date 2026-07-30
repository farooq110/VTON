import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { cn } from "@/client/lib/utils";

export type ViewMode = "table" | "grid";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="inline-flex overflow-hidden rounded-md border bg-muted">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange("table")}
          className={cn(
            "rounded-none",
            value === "table" && "bg-background shadow-sm",
          )}
          aria-pressed={value === "table"}
        >
          <TableIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Table</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange("grid")}
          className={cn(
            "rounded-none",
            value === "grid" && "bg-background shadow-sm",
          )}
          aria-pressed={value === "grid"}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Grid</span>
        </Button>
      </div>

      {/* Mobile-friendly select fallback */}
      <Select value={value} onValueChange={(v) => onChange(v as ViewMode)}>
        <SelectTrigger className="w-[140px] md:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="table">Table</SelectItem>
          <SelectItem value="grid">Grid</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
