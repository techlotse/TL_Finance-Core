import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { budgetItemCreateSchema } from "@/lib/schemas";
import { assertBudgetItemFkOwnership } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const url = new URL(req.url);
    // Soft-deleted line items stay in the DB so past months still render
    // accurately, but the live UI filters them out by default.
    const where: Prisma.BudgetLineItemWhereInput = {
      householdId,
      deletedAt: null
    };

    const itemType = url.searchParams.get("type");
    if (itemType) where.itemType = itemType as Prisma.BudgetLineItemWhereInput["itemType"];

    const categoryId = url.searchParams.get("category");
    if (categoryId) where.categoryId = categoryId;

    const accountId = url.searchParams.get("account");
    if (accountId) where.accountId = accountId;

    const incomeEarnerId = url.searchParams.get("incomeEarner");
    if (incomeEarnerId) where.incomeEarnerId = incomeEarnerId;

    const activeParam = url.searchParams.get("active");
    if (activeParam === "true") where.active = true;
    else if (activeParam === "false") where.active = false;

    const items = await prisma.budgetLineItem.findMany({
      where,
      orderBy: [{ itemType: "asc" }, { name: "asc" }],
      include: {
        category: { include: { group: true } },
        account: true,
        incomeEarner: true
      }
    });
    return jsonOk(serialize(items));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = budgetItemCreateSchema.parse(await req.json());

    await assertBudgetItemFkOwnership(householdId, {
      categoryId: body.categoryId,
      accountId: body.accountId ?? undefined,
      incomeEarnerId: body.incomeEarnerId ?? undefined
    });

    const created = await prisma.budgetLineItem.create({
      data: {
        householdId,
        name: body.name,
        itemType: body.itemType,
        amount: body.amount,
        currency: body.currency,
        recurrence: body.recurrence,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        debitDayOfMonth: body.debitDayOfMonth ?? null,
        categoryId: body.categoryId,
        accountId: body.accountId ?? null,
        incomeEarnerId: body.incomeEarnerId ?? null,
        expectedAnnualReturn: body.expectedAnnualReturn ?? null,
        monthlyManagementCost: body.monthlyManagementCost ?? null,
        notes: body.notes ?? null,
        active: body.active ?? true
      }
    });

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "budget_item",
      resourceId: created.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
