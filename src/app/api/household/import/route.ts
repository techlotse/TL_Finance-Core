import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import {
  importHousehold,
  HOUSEHOLD_EXPORT_VERSION,
  type HouseholdExport
} from "@/lib/household-export";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * POST /api/household/import
 *
 * Body: { payload: HouseholdExport, mode?: "merge" | "replace" }
 *
 * "merge" (default) is non-destructive — existing rows are matched by name
 * and only new rows are created. "replace" hard-deletes everything in the
 * household first, then loads the import. Useful for restoring into an
 * empty / freshly-onboarded household.
 */
export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = (await req.json()) as {
      payload?: HouseholdExport;
      mode?: "merge" | "replace";
    };

    if (!body.payload) {
      return jsonError("Missing 'payload' in request body", 400);
    }
    const payload = body.payload;

    if (typeof payload !== "object" || typeof payload.version !== "number") {
      return jsonError("Payload doesn't look like a valid household export", 422);
    }
    if (payload.version > HOUSEHOLD_EXPORT_VERSION) {
      return jsonError(
        `Export version ${payload.version} is newer than this instance supports (current v${HOUSEHOLD_EXPORT_VERSION})`,
        422
      );
    }
    const mode = body.mode === "replace" ? "replace" : "merge";

    const result = await importHousehold(householdId, payload, mode);

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "household_import",
      resourceId: householdId,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        mode,
        ...result
      }
    });

    return jsonOk({ ok: true, mode, result });
  } catch (err) {
    return handleApiError(err);
  }
}
