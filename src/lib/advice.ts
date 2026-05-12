import { z } from "zod";
import type {
  AccountType,
  Asset,
  BankAccount,
  BankAccountCurrency,
  BudgetLineItem,
  Category,
  CategoryGroup,
  IncomeEarner,
  InvestmentProjection
} from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { convertManyToBase, getExchangeRate } from "./exchange-rates";
import { summarizeMonthlyBudget } from "./forecast";
import { Decimal, toDecimal } from "./money";
import { monthlyMultiplier } from "./recurrence";

type BudgetItemWithRelations = BudgetLineItem & {
  category: Category & { group: CategoryGroup };
  incomeEarner: IncomeEarner | null;
};

type AccountWithCurrencies = BankAccount & {
  currencies: BankAccountCurrency[];
};

export type AdvicePriority = "high" | "medium" | "low";

export type AdviceCategory =
  | "emergency_fund"
  | "job_loss"
  | "cash_allocation"
  | "investing"
  | "retirement"
  | "fire"
  | "kids"
  | "debt"
  | "habits";

export interface AdviceRecommendation {
  id: string;
  priority: AdvicePriority;
  category: AdviceCategory;
  title: string;
  rationale: string;
  action: string;
  monthlyImpact?: string | null;
}

export interface AdviceMetric {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warning" | "danger";
}

export interface FinancialSnapshot {
  generatedAt: string;
  householdId: string;
  baseCurrency: string;
  earnerCount: number;
  earners: Array<{
    id: string;
    name: string;
    monthlyIncome: string;
  }>;
  monthly: {
    income: string;
    livingExpenses: string;
    investmentContributions: string;
    bankCharges: string;
    netAfterPlannedOutflows: string;
    savingsCapacity: string;
    savingsRate: string;
    essentialExpenses: string;
    flexibleExpenses: string;
  };
  balances: {
    liquid: string;
    currentAndCash: string;
    savings: string;
    investments: string;
    tangibleAssets: string;
    totalTracked: string;
    creditDebt: string;
  };
  emergencyFund: {
    targetMonths: number;
    targetAmount: string;
    currentMonths: string;
    surplusOrGap: string;
  };
  jobLoss: {
    largestEarnerMonthlyIncome: string;
    remainingIncomeAfterLargestLoss: string;
    oneEarnerEssentialDeficit: string;
    oneEarnerMonthsCovered: string;
    allEarnerMonthsCovered: string;
    redistributableMonthlyExpenses: string;
  };
  fire: {
    annualLivingExpenses: string;
    targetInvestableAssets: string;
    currentInvestableAssets: string;
    monthlyInvestableCapacity: string;
    estimatedYearsToFire: number | null;
  };
  accounts: Array<{
    id: string;
    name: string;
    accountType: AccountType;
    balanceBase: string;
    annualInterestRate: string | null;
    expectedAnnualReturn: string | null;
    monthlyCost: string | null;
  }>;
  lowYieldSavings: Array<{
    id: string;
    name: string;
    balanceBase: string;
    annualInterestRate: string;
  }>;
  signals: {
    hasKidsPlanning: boolean;
    hasRetirementPlanning: boolean;
    hasInvestmentAccounts: boolean;
    hasHighInterestDebt: boolean;
  };
}

export interface ClassicAdviceResult {
  generatedAt: string;
  baseCurrency: string;
  metrics: AdviceMetric[];
  recommendations: AdviceRecommendation[];
  assumptions: string[];
}

export const aiAdviceSchema = z.object({
  summary: z.string().min(1),
  recommendations: z
    .array(
      z.object({
        id: z.string().min(1),
        priority: z.enum(["high", "medium", "low"]),
        category: z.enum([
          "emergency_fund",
          "job_loss",
          "cash_allocation",
          "investing",
          "retirement",
          "fire",
          "kids",
          "debt",
          "habits"
        ]),
        title: z.string().min(1),
        rationale: z.string().min(1),
        action: z.string().min(1),
        monthlyImpact: z.string().nullable()
      })
    )
    .min(1)
    .max(8),
  caveats: z.array(z.string()).max(6)
});

export type AiAdviceResult = z.infer<typeof aiAdviceSchema>;

export async function buildFinancialSnapshot(
  householdId: string
): Promise<FinancialSnapshot> {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId }
  });
  const baseCurrency = household.baseCurrency;

  const [items, accounts, earners, assets, investmentProjections] =
    await Promise.all([
      prisma.budgetLineItem.findMany({
        where: { householdId, active: true, deletedAt: null },
        include: {
          category: { include: { group: true } },
          incomeEarner: true
        }
      }),
      prisma.bankAccount.findMany({
        where: { householdId, active: true, deletedAt: null },
        include: { currencies: true }
      }),
      prisma.incomeEarner.findMany({
        where: { householdId, active: true, deletedAt: null }
      }),
      prisma.asset.findMany({
        where: { householdId, active: true, deletedAt: null }
      }),
      prisma.investmentProjection.findMany({
        where: { householdId, active: true, deletedAt: null }
      })
    ]);

  return buildFinancialSnapshotFromData({
    householdId,
    baseCurrency,
    items,
    accounts,
    earners,
    assets,
    investmentProjections
  });
}

export async function buildFinancialSnapshotFromData({
  householdId,
  baseCurrency,
  items,
  accounts,
  earners,
  assets,
  investmentProjections
}: {
  householdId: string;
  baseCurrency: string;
  items: BudgetItemWithRelations[];
  accounts: AccountWithCurrencies[];
  earners: IncomeEarner[];
  assets: Asset[];
  investmentProjections: InvestmentProjection[];
}): Promise<FinancialSnapshot> {
  const rateCache = new Map<string, Decimal>();
  async function rate(from: string): Promise<Decimal> {
    const source = from.toUpperCase();
    const target = baseCurrency.toUpperCase();
    if (source === target) return new Decimal(1);
    const key = `${source}:${target}`;
    let cached = rateCache.get(key);
    if (!cached) {
      cached = (await getExchangeRate(source, target)).rate;
      rateCache.set(key, cached);
    }
    return cached;
  }

  const summary = await summarizeMonthlyBudget(baseCurrency, items, accounts);

  const incomeByEarner = new Map<string, Decimal>();
  for (const earner of earners) incomeByEarner.set(earner.id, new Decimal(0));
  let unassignedIncome = new Decimal(0);

  let livingExpenses = new Decimal(0);
  let essentialExpenses = new Decimal(0);
  let flexibleExpenses = new Decimal(0);

  for (const item of items) {
    const monthly = toDecimal(item.amount).mul(
      monthlyMultiplier(item.recurrence)
    );
    const monthlyBase = monthly.mul(await rate(item.currency));

    if (item.itemType === "income") {
      if (item.incomeEarnerId) {
        incomeByEarner.set(
          item.incomeEarnerId,
          (incomeByEarner.get(item.incomeEarnerId) ?? new Decimal(0)).plus(
            monthlyBase
          )
        );
      } else {
        unassignedIncome = unassignedIncome.plus(monthlyBase);
      }
      continue;
    }

    if (item.itemType !== "expense") continue;
    livingExpenses = livingExpenses.plus(monthlyBase);
    if (isEssentialExpense(item)) {
      essentialExpenses = essentialExpenses.plus(monthlyBase);
    } else {
      flexibleExpenses = flexibleExpenses.plus(monthlyBase);
    }
  }

  const bankCharges = summary.monthlyBankCharges;
  livingExpenses = livingExpenses.plus(bankCharges);
  essentialExpenses = essentialExpenses.plus(bankCharges);

  const accountRows: FinancialSnapshot["accounts"] = [];
  let liquid = new Decimal(0);
  let currentAndCash = new Decimal(0);
  let savings = new Decimal(0);
  let investments = new Decimal(0);
  let creditDebt = new Decimal(0);

  for (const account of accounts) {
    const balanceBase = await accountBalanceBase(account, baseCurrency);
    accountRows.push({
      id: account.id,
      name: account.name,
      accountType: account.accountType,
      balanceBase: balanceBase.toString(),
      annualInterestRate: account.annualInterestRate?.toString() ?? null,
      expectedAnnualReturn: account.expectedAnnualReturn?.toString() ?? null,
      monthlyCost: account.monthlyCost?.toString() ?? null
    });

    if (["current", "cash"].includes(account.accountType)) {
      currentAndCash = currentAndCash.plus(balanceBase);
      liquid = liquid.plus(balanceBase);
    } else if (account.accountType === "savings") {
      savings = savings.plus(balanceBase);
      liquid = liquid.plus(balanceBase);
    } else if (account.accountType === "investment") {
      investments = investments.plus(balanceBase);
    } else if (account.accountType === "credit") {
      creditDebt = creditDebt.plus(balanceBase.abs());
    }
  }

  const assetTotal = (
    await convertManyToBase(
      assets.map((asset) => ({
        amount: asset.value,
        currency: asset.currency
      })),
      baseCurrency
    )
  ).total;

  const activeEarnerCount = Math.max(
    earners.length,
    Array.from(incomeByEarner.values()).filter((amount) => amount.gt(0)).length,
    summary.monthlyIncome.gt(0) ? 1 : 0
  );
  const targetMonths = emergencyTargetMonths({
    earnerCount: activeEarnerCount,
    monthlyNet: summary.net,
    hasKidsPlanning: hasKidsSignal(items)
  });
  const emergencyTargetAmount = essentialExpenses.mul(targetMonths);
  const currentEmergencyMonths = essentialExpenses.gt(0)
    ? liquid.div(essentialExpenses)
    : new Decimal(0);

  const largestEarnerIncome = Decimal.max(
    ...Array.from(incomeByEarner.values()),
    unassignedIncome,
    new Decimal(0)
  );
  const remainingAfterLargestLoss = Decimal.max(
    summary.monthlyIncome.minus(largestEarnerIncome),
    new Decimal(0)
  );
  const oneEarnerDeficit = Decimal.max(
    essentialExpenses.minus(remainingAfterLargestLoss),
    new Decimal(0)
  );
  const oneEarnerMonthsCovered = oneEarnerDeficit.gt(0)
    ? liquid.div(oneEarnerDeficit)
    : new Decimal(999);
  const allEarnerMonthsCovered = essentialExpenses.gt(0)
    ? liquid.div(essentialExpenses)
    : new Decimal(999);

  const savingsCapacity = summary.monthlyInvestmentContributions.plus(
    Decimal.max(summary.net, new Decimal(0))
  );
  const savingsRate = summary.monthlyIncome.gt(0)
    ? savingsCapacity.div(summary.monthlyIncome)
    : new Decimal(0);

  const annualLivingExpenses = livingExpenses.mul(12);
  const fireTarget = annualLivingExpenses.mul(25);
  const currentInvestable = investments;
  const estimatedYearsToFire = estimateYearsToTarget({
    current: currentInvestable,
    target: fireTarget,
    monthlyContribution: savingsCapacity,
    annualRealReturn: new Decimal("0.05")
  });

  const lowYieldSavings = accountRows
    .filter((account) => {
      if (account.accountType !== "savings") return false;
      const rateValue = toDecimal(account.annualInterestRate ?? "0");
      return rateValue.lt("0.01") && toDecimal(account.balanceBase).gt(0);
    })
    .map((account) => ({
      id: account.id,
      name: account.name,
      balanceBase: account.balanceBase,
      annualInterestRate: account.annualInterestRate ?? "0"
    }));

  const earnersOut = earners.map((earner) => ({
    id: earner.id,
    name: earner.name,
    monthlyIncome: (incomeByEarner.get(earner.id) ?? new Decimal(0)).toString()
  }));
  if (unassignedIncome.gt(0)) {
    earnersOut.push({
      id: "_unassigned",
      name: "Unassigned",
      monthlyIncome: unassignedIncome.toString()
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    householdId,
    baseCurrency,
    earnerCount: activeEarnerCount,
    earners: earnersOut,
    monthly: {
      income: summary.monthlyIncome.toString(),
      livingExpenses: livingExpenses.toString(),
      investmentContributions:
        summary.monthlyInvestmentContributions.toString(),
      bankCharges: summary.monthlyBankCharges.toString(),
      netAfterPlannedOutflows: summary.net.toString(),
      savingsCapacity: savingsCapacity.toString(),
      savingsRate: savingsRate.toString(),
      essentialExpenses: essentialExpenses.toString(),
      flexibleExpenses: flexibleExpenses.toString()
    },
    balances: {
      liquid: liquid.toString(),
      currentAndCash: currentAndCash.toString(),
      savings: savings.toString(),
      investments: investments.toString(),
      tangibleAssets: assetTotal.toString(),
      totalTracked: liquid.plus(investments).plus(assetTotal).toString(),
      creditDebt: creditDebt.toString()
    },
    emergencyFund: {
      targetMonths,
      targetAmount: emergencyTargetAmount.toString(),
      currentMonths: currentEmergencyMonths.toString(),
      surplusOrGap: liquid.minus(emergencyTargetAmount).toString()
    },
    jobLoss: {
      largestEarnerMonthlyIncome: largestEarnerIncome.toString(),
      remainingIncomeAfterLargestLoss: remainingAfterLargestLoss.toString(),
      oneEarnerEssentialDeficit: oneEarnerDeficit.toString(),
      oneEarnerMonthsCovered: oneEarnerMonthsCovered.toString(),
      allEarnerMonthsCovered: allEarnerMonthsCovered.toString(),
      redistributableMonthlyExpenses: flexibleExpenses.toString()
    },
    fire: {
      annualLivingExpenses: annualLivingExpenses.toString(),
      targetInvestableAssets: fireTarget.toString(),
      currentInvestableAssets: currentInvestable.toString(),
      monthlyInvestableCapacity: savingsCapacity.toString(),
      estimatedYearsToFire
    },
    accounts: accountRows,
    lowYieldSavings,
    signals: {
      hasKidsPlanning: hasKidsSignal(items),
      hasRetirementPlanning:
        hasRetirementSignal(items) || investmentProjections.length > 0,
      hasInvestmentAccounts:
        investments.gt(0) || summary.monthlyInvestmentContributions.gt(0),
      hasHighInterestDebt: accountRows.some(
        (account) =>
          account.accountType === "credit" &&
          toDecimal(account.annualInterestRate ?? "0").gte("0.08") &&
          !toDecimal(account.balanceBase).eq(0)
      )
    }
  };
}

export function buildClassicAdvice(
  snapshot: FinancialSnapshot
): ClassicAdviceResult {
  const currency = snapshot.baseCurrency;
  const monthlyIncome = toDecimal(snapshot.monthly.income);
  const monthlyNet = toDecimal(snapshot.monthly.netAfterPlannedOutflows);
  const savingsRate = toDecimal(snapshot.monthly.savingsRate);
  const liquid = toDecimal(snapshot.balances.liquid);
  const emergencyGap = toDecimal(snapshot.emergencyFund.surplusOrGap);
  const emergencyMonths = toDecimal(snapshot.emergencyFund.currentMonths);
  const emergencyTarget = toDecimal(snapshot.emergencyFund.targetAmount);
  const monthlyInvestments = toDecimal(snapshot.monthly.investmentContributions);
  const savingsCapacity = toDecimal(snapshot.monthly.savingsCapacity);
  const bankCharges = toDecimal(snapshot.monthly.bankCharges);
  const flexibleExpenses = toDecimal(snapshot.monthly.flexibleExpenses);
  const oneEarnerMonths = toDecimal(snapshot.jobLoss.oneEarnerMonthsCovered);
  const fireTarget = toDecimal(snapshot.fire.targetInvestableAssets);
  const currentInvestable = toDecimal(snapshot.fire.currentInvestableAssets);

  const recommendations: AdviceRecommendation[] = [];

  if (monthlyIncome.eq(0)) {
    recommendations.push({
      id: "capture-income",
      priority: "high",
      category: "habits",
      title: "Add reliable income streams",
      rationale:
        "The advice engine cannot judge resilience or savings rate without monthly income.",
      action:
        "Add each earner's recurring net income in Budget before using Smart or AI planning.",
      monthlyImpact: null
    });
  }

  if (monthlyNet.lt(0)) {
    recommendations.push({
      id: "stop-negative-cashflow",
      priority: "high",
      category: "habits",
      title: "Bring monthly cashflow back above zero",
      rationale:
        "Planned outflows are higher than income, so emergency savings or debt capacity will erode.",
      action:
        flexibleExpenses.gt(0)
          ? `Cut or pause flexible categories until at least ${money(
              monthlyNet.abs(),
              currency
            )} per month is released.`
          : "Review fixed bills and recurring commitments until income exceeds planned outflows.",
      monthlyImpact: monthlyNet.abs().toString()
    });
  }

  if (emergencyGap.lt(0)) {
    recommendations.push({
      id: "build-emergency-fund",
      priority: "high",
      category: "emergency_fund",
      title: `Build a ${snapshot.emergencyFund.targetMonths}-month emergency fund`,
      rationale: `Liquid reserves cover about ${emergencyMonths.toDecimalPlaces(
        1
      )} months of essential expenses.`,
      action: `Direct surplus cash to liquid savings until the reserve reaches ${money(
        emergencyTarget,
        currency
      )}.`,
      monthlyImpact: emergencyGap.abs().toString()
    });
  }

  if (
    snapshot.earnerCount > 1 &&
    oneEarnerMonths.lt(snapshot.emergencyFund.targetMonths)
  ) {
    recommendations.push({
      id: "single-earner-loss-buffer",
      priority: "medium",
      category: "job_loss",
      title: "Stress-test a temporary loss of the largest income",
      rationale: `After the largest earner stops contributing, essential spending is covered for about ${oneEarnerMonths.toDecimalPlaces(
        1
      )} months.`,
      action:
        "Keep a written job-loss mode that redirects flexible expenses toward essentials and pauses non-critical investing automatically.",
      monthlyImpact: snapshot.jobLoss.redistributableMonthlyExpenses
    });
  }

  if (emergencyGap.gt(0) && snapshot.lowYieldSavings.length > 0) {
    const excess = Decimal.min(emergencyGap, toDecimal(snapshot.balances.savings));
    recommendations.push({
      id: "redeploy-excess-low-yield-cash",
      priority: "medium",
      category: "cash_allocation",
      title: "Redeploy excess low-yield savings",
      rationale:
        "Your emergency target appears funded while some savings balances earn under 1% annually.",
      action: `Keep the emergency reserve liquid, then move up to ${money(
        excess,
        currency
      )} into higher-yield cash, diversified investments, or planned debt reduction.`,
      monthlyImpact: null
    });
  }

  if (savingsRate.lt("0.15") && monthlyIncome.gt(0)) {
    const targetMonthly = monthlyIncome.mul("0.15");
    const needed = Decimal.max(targetMonthly.minus(savingsCapacity), 0);
    recommendations.push({
      id: "raise-savings-rate",
      priority: monthlyNet.lt(0) ? "medium" : "high",
      category: "investing",
      title: "Raise the household savings rate toward 15%",
      rationale: `Current savings capacity is ${(savingsRate.mul(100)).toDecimalPlaces(
        1
      )}% of income, below a common long-term wealth-building baseline.`,
      action: `Automate another ${money(
        needed,
        currency
      )} per month once the emergency fund is on track.`,
      monthlyImpact: needed.toString()
    });
  }

  if (monthlyInvestments.eq(0) && monthlyNet.gt(0)) {
    recommendations.push({
      id: "start-investing-transfer",
      priority: "medium",
      category: "investing",
      title: "Add an automated investment contribution",
      rationale:
        "Surplus cash is visible, but no recurring investment contribution is configured.",
      action:
        "Start with a conservative automatic transfer after payday and increase it as the emergency fund reaches target.",
      monthlyImpact: Decimal.min(monthlyNet, monthlyIncome.mul("0.10")).toString()
    });
  }

  if (!snapshot.signals.hasRetirementPlanning && monthlyIncome.gt(0)) {
    recommendations.push({
      id: "retirement-wrapper",
      priority: "medium",
      category: "retirement",
      title: "Separate retirement contributions from general savings",
      rationale:
        "No retirement-specific budget item or projection was detected, so long-term investing may be mixed with ordinary cashflow.",
      action:
        "Add a recurring pension, retirement, or tax-advantaged investment line so retirement progress is measurable.",
      monthlyImpact: null
    });
  }

  if (!snapshot.signals.hasKidsPlanning) {
    recommendations.push({
      id: "kids-planning-check",
      priority: "low",
      category: "kids",
      title: "Mark kid-related savings explicitly if relevant",
      rationale:
        "No child, education, or daycare planning signal was detected in the budget.",
      action:
        "If children are part of the plan, add a dedicated education or childcare sinking fund so it is not treated as discretionary surplus.",
      monthlyImpact: null
    });
  }

  if (snapshot.signals.hasHighInterestDebt) {
    recommendations.push({
      id: "pay-high-interest-debt",
      priority: "high",
      category: "debt",
      title: "Prioritize high-interest credit debt",
      rationale:
        "A credit account appears to charge at least 8% annually, which can outpace conservative investment returns.",
      action:
        "After minimum emergency coverage, direct extra surplus to the highest-rate balance before increasing taxable investments.",
      monthlyImpact: null
    });
  }

  if (bankCharges.gt(25)) {
    recommendations.push({
      id: "reduce-bank-fees",
      priority: "low",
      category: "cash_allocation",
      title: "Review recurring bank and account fees",
      rationale: `Bank charges are ${money(bankCharges, currency)} per month.`,
      action:
        "Consolidate duplicate accounts or move routine cash to lower-fee accounts if benefits do not justify the cost.",
      monthlyImpact: bankCharges.toString()
    });
  }

  if (fireTarget.gt(0) && currentInvestable.lt(fireTarget)) {
    const years = snapshot.fire.estimatedYearsToFire;
    recommendations.push({
      id: "fire-gap",
      priority: savingsRate.gte("0.25") ? "low" : "medium",
      category: "fire",
      title: "Track FIRE using invested assets, not account count",
      rationale:
        years == null
          ? "At the current investable contribution rate, the 25x annual-spending target is not reached inside a 60-year projection."
          : `At the current investable contribution rate, the simple 25x annual-spending target is reached in about ${years} years.`,
      action:
        "Use the emergency target as a cash ceiling, then route additional long-term surplus toward diversified investments.",
      monthlyImpact: snapshot.fire.monthlyInvestableCapacity
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain-good-habits",
      priority: "low",
      category: "habits",
      title: "Maintain the current allocation discipline",
      rationale:
        "Emergency coverage, savings rate, and planned investments are within the default Smart thresholds.",
      action:
        "Re-run this analysis after income, account interest rates, major expenses, or family goals change.",
      monthlyImpact: null
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    baseCurrency: currency,
    metrics: [
      metric("Savings rate", `${savingsRate.mul(100).toDecimalPlaces(1)}%`, toneForRate(savingsRate)),
      metric(
        "Emergency runway",
        `${emergencyMonths.toDecimalPlaces(1)} months`,
        emergencyGap.gte(0) ? "good" : "warning"
      ),
      metric(
        "Liquid cash",
        money(liquid, currency),
        emergencyGap.gt(0) ? "good" : "neutral"
      ),
      metric(
        "FIRE target",
        money(fireTarget, currency),
        fireTarget.gt(0) ? "neutral" : "warning"
      )
    ],
    recommendations: recommendations
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
      .slice(0, 8),
    assumptions: [
      "Emergency-fund targets use essential expenses, not total lifestyle spending.",
      "Single-earner households target 6 months of essentials; multi-earner households target 4 months.",
      "FIRE math uses 25x annual living expenses and a simple 5% real return assumption.",
      "This is planning guidance, not regulated financial advice."
    ]
  };
}

export function snapshotForAi(snapshot: FinancialSnapshot) {
  return {
    ...snapshot,
    householdId: undefined,
    accounts: snapshot.accounts.map((account) => ({
      name: account.name,
      accountType: account.accountType,
      balanceBase: account.balanceBase,
      annualInterestRate: account.annualInterestRate,
      expectedAnnualReturn: account.expectedAnnualReturn,
      monthlyCost: account.monthlyCost
    })),
    earners: snapshot.earners.map((earner, index) => ({
      label: `Earner ${index + 1}`,
      monthlyIncome: earner.monthlyIncome
    })),
    lowYieldSavings: snapshot.lowYieldSavings.map((account) => ({
      name: account.name,
      balanceBase: account.balanceBase,
      annualInterestRate: account.annualInterestRate
    }))
  };
}

async function accountBalanceBase(
  account: AccountWithCurrencies,
  baseCurrency: string
): Promise<Decimal> {
  return (
    await convertManyToBase(
      account.currencies.map((pocket) => ({
        amount: pocket.currentBalance,
        currency: pocket.currency
      })),
      baseCurrency
    )
  ).total;
}

function isEssentialExpense(item: BudgetItemWithRelations): boolean {
  const text = searchableText(item);
  const essentialWords = [
    "rent",
    "mortgage",
    "housing",
    "utility",
    "utilities",
    "electric",
    "water",
    "heating",
    "insurance",
    "medical",
    "health",
    "groceries",
    "food",
    "transport",
    "commute",
    "childcare",
    "daycare",
    "school",
    "tax",
    "debt",
    "loan"
  ];
  const flexibleWords = [
    "restaurant",
    "travel",
    "holiday",
    "entertainment",
    "subscription",
    "hobby",
    "shopping",
    "luxury",
    "gift"
  ];
  if (flexibleWords.some((word) => text.includes(word))) return false;
  return essentialWords.some((word) => text.includes(word));
}

function hasKidsSignal(items: BudgetItemWithRelations[]): boolean {
  return items.some((item) => {
    const text = searchableText(item);
    return [
      "kid",
      "kids",
      "child",
      "children",
      "daycare",
      "school",
      "education",
      "university",
      "college"
    ].some((word) => text.includes(word));
  });
}

function hasRetirementSignal(items: BudgetItemWithRelations[]): boolean {
  return items.some((item) => {
    const text = searchableText(item);
    return [
      "retirement",
      "pension",
      "401k",
      "ira",
      "roth",
      "pillar",
      "3a",
      "annuity"
    ].some((word) => text.includes(word));
  });
}

function searchableText(item: BudgetItemWithRelations): string {
  return [
    item.name,
    item.notes,
    item.category.name,
    item.category.group.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function emergencyTargetMonths({
  earnerCount,
  monthlyNet,
  hasKidsPlanning
}: {
  earnerCount: number;
  monthlyNet: Decimal;
  hasKidsPlanning: boolean;
}): number {
  let months = earnerCount <= 1 ? 6 : 4;
  if (monthlyNet.lt(0)) months += 2;
  if (hasKidsPlanning) months += 1;
  return Math.min(12, months);
}

function estimateYearsToTarget({
  current,
  target,
  monthlyContribution,
  annualRealReturn
}: {
  current: Decimal;
  target: Decimal;
  monthlyContribution: Decimal;
  annualRealReturn: Decimal;
}): number | null {
  if (target.lte(0)) return null;
  if (current.gte(target)) return 0;
  if (monthlyContribution.lte(0)) return null;

  const monthlyReturn = new Decimal(
    Math.pow(1 + annualRealReturn.toNumber(), 1 / 12) - 1
  );
  let balance = current;
  for (let month = 1; month <= 60 * 12; month++) {
    balance = balance.mul(new Decimal(1).plus(monthlyReturn)).plus(
      monthlyContribution
    );
    if (balance.gte(target)) return Math.ceil(month / 12);
  }
  return null;
}

function metric(
  label: string,
  value: string,
  tone: AdviceMetric["tone"]
): AdviceMetric {
  return { label, value, tone };
}

function toneForRate(rate: Decimal): AdviceMetric["tone"] {
  if (rate.gte("0.25")) return "good";
  if (rate.gte("0.15")) return "neutral";
  if (rate.gte("0.05")) return "warning";
  return "danger";
}

function priorityRank(priority: AdvicePriority): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function money(value: Decimal, currency: string): string {
  return `${value.toDecimalPlaces(0).toString()} ${currency}`;
}
