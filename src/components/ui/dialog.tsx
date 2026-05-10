"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Lightweight controlled <dialog> wrapper. We avoid a full overlay library; the
 * native <dialog> element is now well-supported and has built-in focus trap.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  title,
  description,
  className
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Close on dismissal events from the native dialog (Esc, form method=dialog).
  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(e) => {
        // Click on backdrop closes.
        if (e.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        "max-w-lg w-[min(92vw,32rem)] p-0 m-auto",
        "open:animate-in",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5 pt-0">{children}</div>
    </dialog>
  );
}
