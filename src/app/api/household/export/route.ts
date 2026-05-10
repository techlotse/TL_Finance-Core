import type { NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import { exportHousehold } from "@/lib/household-export";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * GET /api/household/export
 *
 * Returns a JSON dump of the active household. Sets Content-Disposition so
 * browsers prompt a Save dialog when this URL is hit directly. The file
 * format is ID-free and re-importable on any instance running the same
 * export-version (see lib/household-export.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const payload = await exportHousehold(householdId);

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "household_export",
      resourceId: householdId,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        version: payload.version,
        budgetItems: payload.budgetItems.length,
        accounts: payload.bankAccounts.length
      }
    });

    const filename = `tl-finance-core-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    const body = JSON.stringify(payload, null, 2);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store"
      }
    });
  } catch (err) {
    return handleApiError(err);
  }
}
