import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";

export async function GET(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const url = new URL(req.url);
    const where: Prisma.ActualTransactionWhereInput = { householdId };

    const accountId = url.searchParams.get("account");
    if (accountId) where.accountId = accountId;

    const categoryId = url.searchParams.get("category");
    if (categoryId) where.categoryId = categoryId;

    const reviewState = url.searchParams.get("reviewState");
    if (
      reviewState &&
      ["needs_review", "auto_categorized", "confirmed", "ignored"].includes(reviewState)
    ) {
      where.reviewState = reviewState as Prisma.ActualTransactionWhereInput["reviewState"];
    }

    const start = parseDateParam(url.searchParams.get("start"));
    const end = parseDateParam(url.searchParams.get("end"));
    if (start || end) {
      where.bookingDate = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {})
      };
    }

    const take = Math.min(
      Math.max(Number(url.searchParams.get("take") ?? 100), 1),
      250
    );
    const transactions = await prisma.actualTransaction.findMany({
      where,
      orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
      take,
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, type: true } },
        statementImport: {
          select: { id: true, parserKey: true, fileName: true, createdAt: true }
        }
      }
    });

    return jsonOk(serialize({ ok: true, value: transactions }));
  } catch (err) {
    return handleApiError(err);
  }
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
