import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import {
  categoryCreateSchema,
  categoryGroupCreateSchema
} from "@/lib/schemas";
import { assertCategoryGroupOwnership } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/** Returns category groups with their nested categories. Hides soft-deleted. */
export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const groups = await prisma.categoryGroup.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" }
        }
      }
    });
    return jsonOk(serialize(groups));
  } catch (err) {
    return handleApiError(err);
  }
}

const createInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group"), data: categoryGroupCreateSchema }),
  z.object({ kind: z.literal("category"), data: categoryCreateSchema })
]);

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = createInputSchema.parse(await req.json());
    const ipHash = ipHashFromHeaders(req.headers);

    if (body.kind === "group") {
      const created = await prisma.categoryGroup.create({
        data: { ...body.data, householdId }
      });
      await writeAudit({
        action: "create",
        householdId,
        resourceType: "category_group",
        resourceId: created.id,
        ipHash
      });
      return jsonOk(serialize(created), { status: 201 });
    }

    await assertCategoryGroupOwnership(householdId, body.data.groupId);

    const created = await prisma.category.create({
      data: { ...body.data, householdId }
    });
    await writeAudit({
      action: "create",
      householdId,
      resourceType: "category",
      resourceId: created.id,
      ipHash
    });
    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
