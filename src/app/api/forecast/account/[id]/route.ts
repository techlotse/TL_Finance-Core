import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHousehold } from "@/lib/household";
import { handleApiError, jsonOk } from "@/lib/api";
import { forecastDailyForAccount } from "@/lib/forecast";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const pastDays = Math.min(
      90,
      Math.max(0, Number(url.searchParams.get("pastDays") ?? "30"))
    );
    const futureDays = Math.min(
      365,
      Math.max(0, Number(url.searchParams.get("futureDays") ?? "60"))
    );

    const household = await getActiveHousehold();
    const account = await prisma.bankAccount.findFirst({
      where: { id, householdId: household.id },
      include: { currencies: true }
    });
    if (!account) {
      return jsonOk({ error: "Account not found" }, { status: 404 });
    }

    const [items, transfers] = await Promise.all([
      prisma.budgetLineItem.findMany({
        where: { householdId: household.id, active: true, deletedAt: null }
      }),
      prisma.scheduledTransfer.findMany({
        where: { householdId: household.id, active: true, deletedAt: null }
      })
    ]);

    const series = await forecastDailyForAccount({
      baseCurrency: household.baseCurrency,
      account,
      budgetItems: items,
      transfers,
      pastDays,
      futureDays
    });

    return jsonOk({
      account: series.account,
      baseCurrency: series.baseCurrency,
      pastDays: series.pastDays,
      futureDays: series.futureDays,
      todayIndex: series.todayIndex,
      goesNegative: series.goesNegative,
      low: {
        date: series.low.date.toISOString(),
        totalBaseCurrency: series.low.totalBaseCurrency.toString()
      },
      points: series.points.map((p) => ({
        date: p.date.toISOString(),
        totalBaseCurrency: p.totalBaseCurrency.toString(),
        perCurrency: Object.fromEntries(
          Object.entries(p.perCurrency).map(([k, v]) => [k, v.toString()])
        ),
        events: p.events.map((e) => ({
          kind: e.kind,
          name: e.name,
          amount: e.amount.toString(),
          currency: e.currency
        }))
      }))
    });
  } catch (err) {
    return handleApiError(err);
  }
}
