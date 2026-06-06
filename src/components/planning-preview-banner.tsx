import { FlaskConical } from "lucide-react";

/**
 * Banner shown on Planning-suite pages (Forecast, Investments, Debt, Advice).
 * These predictive tools are parked as preview while the budgeting/analysis
 * split matures — see docs/strategy/PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md.
 */
export function PlanningPreviewBanner({ tool }: { tool: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
      <FlaskConical
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
        strokeWidth={1.5}
      />
      <div>
        <p className="font-medium text-amber-700 dark:text-amber-300">
          Planning · Preview
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {tool} belongs to the Planning suite — predictive &amp; simulation
          tools under active development. Treat its outputs as directional
          projections, not final figures.
        </p>
      </div>
    </div>
  );
}
