import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { accountCreateSchema } from "@/lib/schemas";
import { effectiveMonthlyCostCurrency } from "@/lib/account-currency";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const accounts = await prisma.bankAccount.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { currencies: true }
    });
    return jsonOk(serialize(accounts));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = accountCreateSchema.parse(await req.json());
    const monthlyCostCurrency = body.monthlyCost
      ? effectiveMonthlyCostCurrency(
          {
            monthlyCostCurrency: body.monthlyCostCurrency,
            currencies: body.currencies
          },
          "CHF"
        )
      : null;
    const created = await prisma.bankAccount.create({
      data: {
        householdId,
        name: body.name,
        institution: body.institution ?? null,
        accountType: body.accountType,
        notes: body.notes ?? null,
        active: body.active ?? true,
        monthlyCost: body.monthlyCost ?? null,
        monthlyCostCurrency,
        annualInterestRate: body.annualInterestRate ?? null,
        expectedAnnualReturn: body.expectedAnnualReturn ?? null,
        monthlyManagementCost: body.monthlyManagementCost ?? null,
        minimumMonthlyPayment: body.minimumMonthlyPayment ?? null,
        currencies: {
          create: body.currencies.map((c) => ({
            currency: c.currency,
            openingBalance: c.openingBalance,
            currentBalance: c.currentBalance ?? c.openingBalance
          }))
        }
      },
      include: { currencies: true }
    });
    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
