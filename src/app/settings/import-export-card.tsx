"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, AlertTriangle } from "lucide-react";

type ImportMode = "merge" | "replace";
const REPLACE_CONFIRMATION = "DELETE CURRENT HOUSEHOLD DATA";

interface ImportResult {
  earners: { created: number; matched: number };
  groups: { created: number; matched: number };
  categories: { created: number; matched: number };
  accounts: { created: number; matched: number };
  budgetItems: { created: number; skipped: number };
  transfers: { created: number; skipped: number };
  projections: { created: number; skipped: number };
  assets: { created: number; skipped: number };
  warnings: string[];
}

export function ImportExportCard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/household/export");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      // Force a download via a synthetic anchor — we already have the
      // attachment header but Fetch consumes it, so re-create the file.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tl-finance-core-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("That doesn't look like a valid JSON file.");
      }

      let confirmReplace: string | undefined;
      if (mode === "replace") {
        const typed = prompt(
          `Replace mode permanently deletes current household data before loading the file.\n\nType ${REPLACE_CONFIRMATION} to continue.`
        );
        if (typed !== REPLACE_CONFIRMATION) {
          setImporting(false);
          return;
        }
        confirmReplace = typed;
      }

      const res = await fetch("/api/household/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, mode, confirmReplace })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Import failed (${res.status})`);
      }
      setResult(json.result as ImportResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup &amp; restore</CardTitle>
        <CardDescription>
          Export everything in your household to a JSON file for safekeeping,
          or restore a previous export. The format is portable across instances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            <Download className="h-4 w-4" />
            {exporting ? "Preparing…" : "Export to JSON"}
          </Button>
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">Import a JSON export</p>
            <fieldset className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="import-mode"
                  value="merge"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  <strong>Merge</strong> — add missing rows, leave existing data alone (safe)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span className="text-destructive">
                  <strong>Replace</strong> — wipe current household first (destructive)
                </span>
              </label>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              variant={mode === "replace" ? "destructive" : "default"}
            >
              <Upload className="h-4 w-4" />
              {importing ? "Importing…" : "Choose file…"}
            </Button>
          </div>
          {mode === "replace" && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Replace mode hard-deletes everything in this household before
                loading the file. Make sure you have a recent export first.
              </span>
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-md border border-border bg-muted/20 p-4 text-sm space-y-1.5">
            <p className="font-medium">Import complete</p>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              <ResultRow label="Earners" v={result.earners} />
              <ResultRow label="Category groups" v={result.groups} />
              <ResultRow label="Categories" v={result.categories} />
              <ResultRow label="Accounts" v={result.accounts} />
              <ResultRow label="Budget items" v={result.budgetItems} />
              <ResultRow label="Transfers" v={result.transfers} />
              <ResultRow label="Projections" v={result.projections} />
              <ResultRow label="Assets" v={result.assets} />
            </ul>
            {result.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {result.warnings.length} warning
                  {result.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultRow({
  label,
  v
}: {
  label: string;
  v: { created: number; matched?: number; skipped?: number };
}) {
  const parts: string[] = [`${v.created} created`];
  if (v.matched !== undefined) parts.push(`${v.matched} matched`);
  if (v.skipped !== undefined) parts.push(`${v.skipped} skipped`);
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{parts.join(", ")}</span>
    </li>
  );
}
