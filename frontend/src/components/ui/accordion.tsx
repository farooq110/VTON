import { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accordion — lightweight, accessible accordion for the Settings page (Issue 7).
 *
 * Each heavy-content section on the Settings page is wrapped in an
 * Accordion.Item so the user can collapse sections they're not interested
 * in. The first section defaults to open; the rest default to collapsed
 * so the page doesn't feel like an endless scroll.
 *
 * Features:
 *   - Animated expand/collapse via framer-motion (height + opacity).
 *   - Accessible: `aria-expanded`, `aria-controls`, `role="region"`.
 *   - Chevron rotates 180° when open.
 *   - `defaultOpen` prop controls the initial state.
 *   - Self-contained — no external accordion library needed.
 *
 * Usage:
 *   <Accordion>
 *     <Accordion.Item title="Brand identity" icon={<ImageIcon />} defaultOpen>
 *       <BrandSection />
 *     </Accordion.Item>
 *     <Accordion.Item title="Theme" icon={<Palette />}>
 *       <ThemeSection />
 *     </Accordion.Item>
 *   </Accordion>
 */
export interface AccordionProps {
  children: React.ReactNode;
  className?: string;
}

export function Accordion({ children, className }: AccordionProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {children}
    </div>
  );
}

export interface AccordionItemProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AccordionItem({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const buttonId = useId();

  return (
    <section className="rounded-2xl bg-card border border-border overflow-hidden">
      <button
        id={buttonId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-muted/40 transition"
      >
        {icon && (
          <span className="shrink-0 h-10 w-10 rounded-xl bg-accent/10 text-accent grid place-items-center">
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-base sm:text-lg font-medium leading-tight">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {description}
            </p>
          )}
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 h-8 w-8 grid place-items-center rounded-lg hover:bg-muted"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
