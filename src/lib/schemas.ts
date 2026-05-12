import { z } from "zod";

// 3-letter ISO currency code, uppercase.
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO currency code");

// Money on the wire: accept strings (preferred) or numbers, coerce to string.
export const moneyAmount = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), {
    message: "Must be a valid number"
  });

// Percentage stored as decimal fraction (0.05 = 5%). Accept string or number.
export const decimalRate = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), {
    message: "Must be a valid number"
  });

export const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "Must be a valid ISO date"
  });

export const recurrenceEnum = z.enum([
  "once",
  "weekly",
  "monthly",
  "quarterly",
  "yearly"
]);

export const itemTypeEnum = z.enum([
  "income",
  "expense",
  "investment_contribution"
]);

export const categoryTypeEnum = z.enum([
  "income",
  "expense",
  "transfer",
  "investment"
]);

export const accountTypeEnum = z.enum([
  "current",
  "savings",
  "investment",
  "credit",
  "cash",
  "other"
]);

export const contributionFrequencyEnum = z.enum([
  "monthly",
  "quarterly",
  "yearly"
]);

export const productTierEnum = z.enum(["core", "smart", "ai"]);

// ---- Household ----
export const householdPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  baseCurrency: currencyCode.optional()
});

// ---- Income earner ----
export const incomeEarnerCreateSchema = z.object({
  name: z.string().trim().min(1),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional()
});
export const incomeEarnerPatchSchema = incomeEarnerCreateSchema.partial();

// ---- Categories ----
export const categoryGroupCreateSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional()
});

export const categoryCreateSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().trim().min(1),
  type: categoryTypeEnum,
  sortOrder: z.number().int().optional()
});
export const categoryPatchSchema = categoryCreateSchema.partial();

// ---- Bank accounts ----
export const accountCurrencyInputSchema = z.object({
  currency: currencyCode,
  openingBalance: moneyAmount.default("0"),
  currentBalance: moneyAmount.optional()
});

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1),
  institution: z.string().optional().nullable(),
  accountType: accountTypeEnum.default("current"),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  monthlyCost: moneyAmount.optional().nullable(),
  monthlyCostCurrency: currencyCode.optional().nullable(),
  annualInterestRate: decimalRate.optional().nullable(),
  expectedAnnualReturn: decimalRate.optional().nullable(),
  monthlyManagementCost: moneyAmount.optional().nullable(),
  minimumMonthlyPayment: moneyAmount.optional().nullable(),
  currencies: z.array(accountCurrencyInputSchema).min(1)
});
// ---- Balance snapshots ----
export const balanceSnapshotCreateSchema = z.object({
  // Pocket id (BankAccountCurrency.id) — we resolve and tenant-check this on
  // the server. Cleaner than passing currency, since one account can hold
  // multiple pockets in the same currency over its lifetime.
  accountCurrencyId: z.string().min(1),
  balance: moneyAmount,
  asOf: isoDate.optional(),
  note: z.string().max(500).nullable().optional()
});

export const accountPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  institution: z.string().optional().nullable(),
  accountType: accountTypeEnum.optional(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  monthlyCost: moneyAmount.optional().nullable(),
  monthlyCostCurrency: currencyCode.optional().nullable(),
  annualInterestRate: decimalRate.optional().nullable(),
  expectedAnnualReturn: decimalRate.optional().nullable(),
  monthlyManagementCost: moneyAmount.optional().nullable(),
  minimumMonthlyPayment: moneyAmount.optional().nullable(),
  currencies: z.array(accountCurrencyInputSchema).optional()
});

// ---- Assets ----
export const assetCategoryEnum = z.enum([
  "property",
  "vehicle",
  "jewelry",
  "collectible",
  "precious_metal",
  "electronics",
  "other"
]);

export const assetCreateSchema = z.object({
  name: z.string().trim().min(1),
  category: assetCategoryEnum.default("other"),
  value: moneyAmount,
  currency: currencyCode,
  // Signed annual rate: 0.04 = +4% / yr, -0.15 = -15% / yr (depreciation).
  annualAppreciationRate: decimalRate.default("0"),
  acquiredAt: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional()
});
export const assetPatchSchema = assetCreateSchema.partial();

// ---- Budget items ----
export const budgetItemCreateSchema = z.object({
  name: z.string().trim().min(1),
  itemType: itemTypeEnum,
  amount: moneyAmount,
  currency: currencyCode,
  recurrence: recurrenceEnum,
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  debitDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  categoryId: z.string().min(1),
  accountId: z.string().nullable().optional(),
  incomeEarnerId: z.string().nullable().optional(),
  expectedAnnualReturn: decimalRate.nullable().optional(),
  monthlyManagementCost: moneyAmount.nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional()
});
export const budgetItemPatchSchema = budgetItemCreateSchema.partial();

// ---- Category groups (top-level edit/delete on top of POST in /api/categories)
export const categoryGroupPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional()
});

// ---- Scheduled transfers ----
export const transferCreateSchema = z.object({
  name: z.string().trim().min(1),
  sourceAccountId: z.string().min(1),
  sourceCurrency: currencyCode,
  targetAccountId: z.string().min(1),
  targetCurrency: currencyCode,
  amount: moneyAmount,
  recurrence: recurrenceEnum,
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional()
});
export const transferPatchSchema = transferCreateSchema.partial();

// ---- Investment projections ----
export const investmentProjectionCreateSchema = z.object({
  name: z.string().trim().min(1),
  startingCapital: moneyAmount,
  currency: currencyCode,
  recurringContribution: moneyAmount,
  contributionFrequency: contributionFrequencyEnum,
  expectedAnnualReturn: decimalRate,
  annualFeeDrag: decimalRate.optional(),
  inflationRate: decimalRate.optional(),
  horizonYears: z.number().int().min(1).max(60),
  accountId: z.string().nullable().optional()
});
export const investmentProjectionPatchSchema =
  investmentProjectionCreateSchema.partial();

// ---- Auth ----
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Must be a valid email")
  .max(254);

export const passwordField = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200);

export const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  productTier: productTierEnum.default("core")
});

export const signinSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password required")
});

export const requestPasswordResetSchema = z.object({
  email: emailField
});

export const completePasswordResetSchema = z.object({
  token: z.string().min(10),
  password: passwordField
});

// ---- Onboarding ----
export const categoryPresetEnum = z.enum(["swiss", "german", "french", "generic"]);

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1).max(120),
  baseCurrency: currencyCode,
  earners: z
    .array(z.object({ name: z.string().trim().min(1).max(120) }))
    .min(1)
    .max(2),
  categoryPreset: categoryPresetEnum
});

export const householdCreateSchema = onboardingSchema;

// ---- Admin config ----
export const adminAuthConfigPatchSchema = z.object({
  signupEnabled: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
  sessionTtlDays: z.number().int().min(1).max(365).optional(),
  maxFailedSignins: z.number().int().min(1).max(1000).optional()
});

export const adminMailConfigPatchSchema = z.object({
  provider: z.enum(["smtp", "none"]).optional(),
  smtpHost: z.string().trim().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().trim().optional().nullable(),
  // null clears the stored password; undefined leaves it untouched.
  smtpPassword: z.string().optional().nullable(),
  fromName: z.string().trim().optional().nullable(),
  fromEmail: emailField.optional().nullable()
});

export const adminBackupConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  endpoint: z.string().url().optional().nullable(),
  region: z.string().trim().optional().nullable(),
  bucket: z.string().trim().optional().nullable(),
  accessKeyId: z.string().trim().optional().nullable(),
  secretAccessKey: z.string().optional().nullable(),
  scheduleCron: z.string().trim().optional().nullable()
});

export const adminAiConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.literal("openai").optional(),
  model: z.string().trim().min(1).max(120).optional(),
  // null clears the stored key; undefined leaves it untouched.
  apiKey: z.string().optional().nullable()
});

export const adminObservabilityConfigPatchSchema = z.object({
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  sentryDsn: z.string().trim().optional().nullable(),
  retainAuditDays: z.number().int().min(1).max(3650).optional().nullable()
});
