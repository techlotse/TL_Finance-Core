"use client";

import * as React from "react";

type Mode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: Mode;
  resolved: "light" | "dark";
  setMode: (next: Mode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "tlfc.theme";

function readStoredMode(): Mode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  // Hydrate from storage on first client render.
  React.useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  // Apply theme class to <html> whenever mode (or system pref) changes.
  React.useEffect(() => {
    const applyResolved = () => {
      const isDark =
        mode === "dark" || (mode === "system" && systemPrefersDark());
      const root = document.documentElement;
      root.classList.toggle("dark", isDark);
      setResolved(isDark ? "dark" : "light");
    };
    applyResolved();

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", applyResolved);
      return () => mq.removeEventListener("change", applyResolved);
    }
  }, [mode]);

  const setMode = React.useCallback((next: Mode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
