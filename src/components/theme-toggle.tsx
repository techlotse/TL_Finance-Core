"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const items: { value: "light" | "dark" | "system"; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun className="h-4 w-4" />, label: "Light" },
    { value: "dark", icon: <Moon className="h-4 w-4" />, label: "Dark" },
    { value: "system", icon: <Monitor className="h-4 w-4" />, label: "System" }
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card p-1",
        className
      )}
    >
      {items.map((it) => (
        <button
          key={it.value}
          role="radio"
          aria-checked={mode === it.value}
          aria-label={it.label}
          onClick={() => setMode(it.value)}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
            mode === it.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {it.icon}
        </button>
      ))}
    </div>
  );
}
