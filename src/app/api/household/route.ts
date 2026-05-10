import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHousehold } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { householdPatchSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    return jsonOk(serialize(household));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = householdPatchSchema.parse(await req.json());
    const current = await getActiveHousehold();
    const updated = await prisma.household.update({
      where: { id: current.id },
      data: body
    });

    await writeAudit({
      action: "update",
      householdId: current.id,
      resourceType: "household",
      resourceId: current.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}
