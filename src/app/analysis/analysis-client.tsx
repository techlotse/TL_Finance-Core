"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertTriangle, ArrowLeftRight, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export interface AnalysisTxn {
  id: string;
  date: string;
  description: string;
  account: string | null;
  category: string | null;
  amount: string;
  currency: string;
  reviewState: string;
  notes: string | null;
}
export interface ImportRow {
  id: string;
  parserKey: string;
  institution: string;
  fileName: string | null;
  importedCount: number;
  duplicateCount: number;
  warningCount: number;
  createdAt: string;
}
interface Summary {
  moneyIn: string;
  moneyOut: string;
  net: string;
  internal: string;
  stale: string[];
  txnCount: number;
}
interface PreviewResult {
  parserKey: string;
  parserVersion: string;
  institution: string;
  rowCount: number;
  warningCount: number;
  warnings: { code: string; message: string; rowNumber?: number }[];
  sampleRows: {
    bookingDate: string;
    amount: string;
    currency: string;
    description: string;
  }[];
}

export function AnalysisClient({
  baseCurrency,
  accounts,
  transactions,
  imports,
  summary
}: {
  baseCurrency: string;
  accounts: { id: string; name: string }[];
  transactions: AnalysisTxn[];
  imports: ImportRow[];
  summary: Summary;
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [accountId, setAccountId] = React.useState<string>("");
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "commit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  function buildForm(): FormData {
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (accountId) fd.append("accountId", accountId);
    return fd;
  }

  async function doPreview() {
    if (!file) return;
    setBusy("preview");
    setError(null);
    setDone(null);
    setPreview(null);
    try {
      const res = await fetch("/api/statement-imports/preview", { method: "POST", body: buildForm() });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Preview failed");
      setPreview(json.value as PreviewResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function doCommit() {
    if (!file) return;
    setBusy("commit");
    setError(null);
    try {
      const res = await fetch("/api/statement-imports", { method: "POST", body: buildForm() });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Import failed");
      setDone(
        `Imported ${json.value.importedCount} transaction(s)` +
          (json.value.duplicateCount ? `, ${json.value.duplicateCount} duplicate(s) skipped` : "")
      );
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryTile label="Money in" value={formatMoney(summary.moneyIn, baseCurrency)} tone="pos" icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />} />
        <SummaryTile label="Money out" value={formatMoney(summary.moneyOut, baseCurrency)} tone="neg" icon={<TrendingDown className="h-4 w-4" strokeWidth={1.5} />} />
        <SummaryTile label="Net" value={formatMoney(summary.net, baseCurrency)} tone={Number(summary.net) >= 0 ? "pos" : "neg"} icon={<Layers className="h-4 w-4" strokeWidth={1.5} />} />
        <SummaryTile label="Internal & FX (excluded)" value={formatMoney(summary.internal, baseCurrency)} tone="muted" icon={<ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Across {summary.txnCount} transaction(s), converted to {baseCurrency}. Inter-account transfers and
        currency exchanges are detected and excluded from money in/out.
        {summary.stale.length > 0 && ` FX rates stale for: ${summary.stale.join(", ")}.`}
      </p>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" strokeWidth={1.5} /> Import a statement
          </CardTitle>
          <CardDescription>
            UBS account CSV, UBS card CSV and Revolut per-currency CSV are recognised automatically.
            Preview first — nothing is saved until you confirm. Re-importing the same file is safe (deduplicated).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setDone(null);
                setError(null);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="sm:max-w-[220px]"
              aria-label="Link to account (optional)"
            >
              <option value="">No account link (detect only)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={doPreview} disabled={!file || busy !== null}>
              {busy === "preview" ? "Reading…" : "Preview"}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              {done}
            </div>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{preview.institution.toUpperCase()}</Badge>
                <span className="text-muted-foreground">parser</span>
                <code className="rounded bg-background px-1.5 py-0.5 text-xs">{preview.parserKey}</code>
                <span className="ml-auto font-medium">{preview.rowCount} rows</span>
                {preview.warningCount > 0 && (
                  <Badge variant="warning">{preview.warningCount} warning(s)</Badge>
                )}
              </div>
              {preview.sampleRows.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Description</TH>
                        <TH className="text-right">Amount</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {preview.sampleRows.slice(0, 8).map((r, i) => (
                        <TR key={i}>
                          <TD className="whitespace-nowrap text-muted-foreground">{r.bookingDate}</TD>
                          <TD className="max-w-[360px] truncate">{r.description}</TD>
                          <TD className="text-right tabular">{formatMoney(r.amount, r.currency)} {r.currency}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {preview.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>• {w.message}{w.rowNumber ? ` (row ${w.rowNumber})` : ""}</li>
                  ))}
                  {preview.warnings.length > 5 && <li>• …and {preview.warnings.length - 5} more</li>}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={doCommit} disabled={busy !== null}>
                  {busy === "commit" ? "Importing…" : `Import ${preview.rowCount} transactions`}
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy !== null}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {imports.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Recent imports: </span>
              {imports.slice(0, 4).map((im, i) => (
                <span key={im.id}>
                  {i > 0 && " · "}
                  {im.fileName ?? im.parserKey} ({im.importedCount})
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" strokeWidth={1.5} /> Transactions
          </CardTitle>
          <CardDescription>Most recent {transactions.length} normalized rows.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
              title="No transactions yet"
              description="Import a UBS or Revolut statement above to populate the analysis ledger."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Account</TH>
                    <TH>Category</TH>
                    <TH>Flow</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {transactions.map((t) => {
                    const internal = t.reviewState === "ignored";
                    const amt = Number(t.amount);
                    return (
                      <TR key={t.id} className={internal ? "opacity-60" : undefined}>
                        <TD className="whitespace-nowrap text-muted-foreground">{t.date}</TD>
                        <TD className="max-w-[340px] truncate" title={t.description}>{t.description}</TD>
                        <TD className="whitespace-nowrap text-muted-foreground">{t.account ?? "—"}</TD>
                        <TD className="whitespace-nowrap">{t.category ?? <span className="text-muted-foreground">—</span>}</TD>
                        <TD>
                          {internal ? (
                            <Badge variant="secondary" title={t.notes ?? undefined}>Internal</Badge>
                          ) : amt >= 0 ? (
                            <Badge variant="success">Income</Badge>
                          ) : (
                            <Badge variant="outline">Spending</Badge>
                          )}
                        </TD>
                        <TD className={`text-right tabular ${internal ? "" : amt >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatMoney(t.amount, t.currency)} <span className="text-xs text-muted-foreground">{t.currency}</span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "muted";
  icon: React.ReactNode;
}) {
  const colour = tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <div className={`mt-2 text-xl font-semibold tabular ${colour}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
