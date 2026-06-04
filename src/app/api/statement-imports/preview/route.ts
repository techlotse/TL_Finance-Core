import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { ipHashFromHeaders } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getActiveHouseholdId } from "@/lib/household";
import { assertAccountOwnership } from "@/lib/ownership";
import { parseStatementInput } from "@/lib/statements";
import { readStatementImportRequest } from "@/lib/statements/request";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const { input, parserKey, accountId } = await readStatementImportRequest(req);
    if (accountId) await assertAccountOwnership(householdId, accountId);

    const parsed = await parseStatementInput({ input, parserKey });

    await writeAudit({
      action: "statement_import_preview",
      householdId,
      resourceType: "statement_import",
      resourceId: input.contentHash,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        parserKey: parsed.parserKey,
        institution: parsed.institution,
        rowCount: parsed.rows.length,
        warningCount: parsed.warnings.length
      }
    });

    return jsonOk({
      ok: true,
      value: {
        contentHash: input.contentHash,
        fileName: input.fileName,
        fileMimeType: input.mimeType,
        parserKey: parsed.parserKey,
        parserVersion: parsed.parserVersion,
        institution: parsed.institution,
        rowCount: parsed.rows.length,
        warningCount: parsed.warnings.length,
        warnings: parsed.warnings,
        sampleRows: parsed.rows.slice(0, 50)
      }
    });
  } catch (err) {
    return handleApiError(err);
  }
}
