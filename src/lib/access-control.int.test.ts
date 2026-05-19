import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_HOUSEHOLD_COOKIE } from "@/lib/active-household";
import { SESSION_COOKIE, createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET as getHousehold } from "@/app/api/household/route";
import { PATCH as patchAccount } from "@/app/api/accounts/[id]/route";
import { DELETE as deleteAccount } from "@/app/api/accounts/[id]/route";
import {
  PATCH as patchCategory,
  DELETE as deleteCategory
} from "@/app/api/categories/[id]/route";
import {
  PATCH as patchCategoryGroup,
  DELETE as deleteCategoryGroup
} from "@/app/api/category-groups/[id]/route";
import {
  PATCH as patchIncomeEarner,
  DELETE as deleteIncomeEarner
} from "@/app/api/income-earners/[id]/route";
import {
  PATCH as patchBudgetItem,
  DELETE as deleteBudgetItem
} from "@/app/api/budget-items/[id]/route";
import {
  PATCH as patchTransfer,
  DELETE as deleteTransfer
} from "@/app/api/transfers/[id]/route";
import { POST as createTransfer } from "@/app/api/transfers/route";
import {
  PATCH as patchAsset,
  DELETE as deleteAsset
} from "@/app/api/assets/[id]/route";
import {
  PATCH as patchProjection,
  DELETE as deleteProjection
} from "@/app/api/investment-projections/[id]/route";
import { POST as switchHousehold } from "@/app/api/household/switch/route";
import { PATCH as patchAdminAuth } from "@/app/api/admin/config/auth/route";
import { PATCH as patchAdminUserAccess } from "@/app/api/admin/users/[id]/access/route";
import { POST as requestPasswordReset } from "@/app/api/auth/reset-password/request/route";
import { POST as completePasswordReset } from "@/app/api/auth/reset-password/complete/route";
import { POST as requestEmailVerification } from "@/app/api/auth/verify-email/request/route";
import { POST as consumeEmailVerification } from "@/app/api/auth/verify-email/[token]/route";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { verifyPassword } from "@/lib/auth";

const cookieState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: [] as Array<{ name: string; value: string }>
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieState.values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (cookie: { name: string; value: string }) => {
      cookieState.values.set(cookie.name, cookie.value);
      cookieState.writes.push({ name: cookie.name, value: cookie.value });
    }
  })
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: async () => ({ delivered: true })
}));

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "Session",
      "EmailVerificationToken",
      "PasswordResetToken",
      "HouseholdMember",
      "BalanceSnapshot",
      "BankAccountCurrency",
      "BudgetLineItem",
      "ScheduledTransfer",
      "InvestmentProjection",
      "Asset",
      "IncomeEarner",
      "Category",
      "CategoryGroup",
      "BankAccount",
      "ExchangeRate",
      "AdminConfig",
      "Household",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

async function seedAccessScenario() {
  const passwordHash = await hashPassword("correct horse battery staple");
  const [alice, bob] = await Promise.all([
    prisma.user.create({
      data: {
        email: "alice@example.test",
        passwordHash,
        emailVerifiedAt: new Date()
      }
    }),
    prisma.user.create({
      data: {
        email: "bob@example.test",
        passwordHash,
        emailVerifiedAt: new Date()
      }
    })
  ]);

  const [alicePrimary, aliceSecond, bobHousehold] = await Promise.all([
    prisma.household.create({
      data: { name: "Alice primary", baseCurrency: "CHF" }
    }),
    prisma.household.create({
      data: { name: "Alice second", baseCurrency: "EUR" }
    }),
    prisma.household.create({
      data: { name: "Bob household", baseCurrency: "USD" }
    })
  ]);

  const [alicePrimaryMember, aliceSecondMember, bobMember] = await Promise.all([
    prisma.householdMember.create({
      data: {
        householdId: alicePrimary.id,
        userId: alice.id,
        role: "owner"
      }
    }),
    prisma.householdMember.create({
      data: {
        householdId: aliceSecond.id,
        userId: alice.id,
        role: "owner"
      }
    }),
    prisma.householdMember.create({
      data: {
        householdId: bobHousehold.id,
        userId: bob.id,
        role: "owner"
      }
    })
  ]);

  const [aliceAccount, aliceSavings, bobAccount, bobSavings] = await Promise.all([
    prisma.bankAccount.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice checking",
        currencies: {
          create: [{ currency: "CHF", openingBalance: "100", currentBalance: "100" }]
        }
      }
    }),
    prisma.bankAccount.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice savings",
        currencies: {
          create: [{ currency: "CHF", openingBalance: "0", currentBalance: "0" }]
        }
      }
    }),
    prisma.bankAccount.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob checking",
        currencies: {
          create: [{ currency: "USD", openingBalance: "100", currentBalance: "100" }]
        }
      }
    }),
    prisma.bankAccount.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob savings",
        currencies: {
          create: [{ currency: "USD", openingBalance: "0", currentBalance: "0" }]
        }
      }
    })
  ]);

  const [aliceGroup, bobGroup] = await Promise.all([
    prisma.categoryGroup.create({
      data: { householdId: alicePrimary.id, name: "Alice group" }
    }),
    prisma.categoryGroup.create({
      data: { householdId: bobHousehold.id, name: "Bob group" }
    })
  ]);
  const [aliceCategory, bobCategory] = await Promise.all([
    prisma.category.create({
      data: {
        householdId: alicePrimary.id,
        groupId: aliceGroup.id,
        name: "Alice category",
        type: "expense"
      }
    }),
    prisma.category.create({
      data: {
        householdId: bobHousehold.id,
        groupId: bobGroup.id,
        name: "Bob category",
        type: "expense"
      }
    })
  ]);
  const [aliceEarner, bobEarner] = await Promise.all([
    prisma.incomeEarner.create({
      data: { householdId: alicePrimary.id, name: "Alice earner" }
    }),
    prisma.incomeEarner.create({
      data: { householdId: bobHousehold.id, name: "Bob earner" }
    })
  ]);
  const [aliceBudgetItem, bobBudgetItem] = await Promise.all([
    prisma.budgetLineItem.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice rent",
        itemType: "expense",
        amount: "1200",
        currency: "CHF",
        recurrence: "monthly",
        startDate: new Date("2026-01-01T00:00:00Z"),
        categoryId: aliceCategory.id,
        accountId: aliceAccount.id,
        incomeEarnerId: aliceEarner.id
      }
    }),
    prisma.budgetLineItem.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob rent",
        itemType: "expense",
        amount: "1500",
        currency: "USD",
        recurrence: "monthly",
        startDate: new Date("2026-01-01T00:00:00Z"),
        categoryId: bobCategory.id,
        accountId: bobAccount.id,
        incomeEarnerId: bobEarner.id
      }
    })
  ]);
  const [aliceTransfer, bobTransfer] = await Promise.all([
    prisma.scheduledTransfer.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice transfer",
        sourceAccountId: aliceAccount.id,
        sourceCurrency: "CHF",
        targetAccountId: aliceSavings.id,
        targetCurrency: "CHF",
        amount: "100",
        recurrence: "monthly",
        startDate: new Date("2026-01-01T00:00:00Z")
      }
    }),
    prisma.scheduledTransfer.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob transfer",
        sourceAccountId: bobAccount.id,
        sourceCurrency: "USD",
        targetAccountId: bobSavings.id,
        targetCurrency: "USD",
        amount: "100",
        recurrence: "monthly",
        startDate: new Date("2026-01-01T00:00:00Z")
      }
    })
  ]);
  const [aliceAsset, bobAsset] = await Promise.all([
    prisma.asset.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice asset",
        category: "other",
        value: "500",
        currency: "CHF",
        annualAppreciationRate: "0"
      }
    }),
    prisma.asset.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob asset",
        category: "other",
        value: "500",
        currency: "USD",
        annualAppreciationRate: "0"
      }
    })
  ]);
  const [aliceProjection, bobProjection] = await Promise.all([
    prisma.investmentProjection.create({
      data: {
        householdId: alicePrimary.id,
        name: "Alice projection",
        startingCapital: "1000",
        currency: "CHF",
        recurringContribution: "100",
        contributionFrequency: "monthly",
        expectedAnnualReturn: "0.04",
        annualFeeDrag: "0",
        inflationRate: "0",
        horizonYears: 10,
        accountId: aliceAccount.id
      }
    }),
    prisma.investmentProjection.create({
      data: {
        householdId: bobHousehold.id,
        name: "Bob projection",
        startingCapital: "1000",
        currency: "USD",
        recurringContribution: "100",
        contributionFrequency: "monthly",
        expectedAnnualReturn: "0.04",
        annualFeeDrag: "0",
        inflationRate: "0",
        horizonYears: 10,
        accountId: bobAccount.id
      }
    })
  ]);

  const aliceSession = await createSession(alice.id);
  const bobSession = await createSession(bob.id);

  return {
    alice,
    bob,
    alicePrimary,
    aliceSecond,
    bobHousehold,
    alicePrimaryMember,
    aliceSecondMember,
    bobMember,
    aliceAccount,
    aliceSavings,
    bobAccount,
    bobSavings,
    aliceGroup,
    bobGroup,
    aliceCategory,
    bobCategory,
    aliceEarner,
    bobEarner,
    aliceBudgetItem,
    bobBudgetItem,
    aliceTransfer,
    bobTransfer,
    aliceAsset,
    bobAsset,
    aliceProjection,
    bobProjection,
    aliceToken: aliceSession.token,
    bobToken: bobSession.token
  };
}

function setCookies(values: Record<string, string | undefined>) {
  cookieState.values.clear();
  cookieState.writes = [];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) cookieState.values.set(name, value);
  }
}

type IdRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function callIdRoute(
  handler: IdRouteHandler,
  method: "PATCH" | "DELETE",
  id: string,
  body?: unknown,
  suffix = ""
) {
  return handler(jsonRequest(`http://localhost/api/test/${id}${suffix}`, method, body), {
    params: Promise.resolve({ id })
  });
}

describe("v0.7 auth and access controls", () => {
  beforeEach(async () => {
    await resetDatabase();
    setCookies({});
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("ignores a forged active-household cookie for another user's membership", async () => {
    const fixture = await seedAccessScenario();
    setCookies({
      [SESSION_COOKIE]: fixture.aliceToken,
      [ACTIVE_HOUSEHOLD_COOKIE]: fixture.bobMember.id
    });

    const res = await getHousehold();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect([fixture.alicePrimary.id, fixture.aliceSecond.id]).toContain(
      body.id
    );
    expect(body.id).not.toBe(fixture.bobHousehold.id);
  });

  it("rejects switching to another user's household membership", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await switchHousehold(
      new NextRequest("http://localhost/api/household/switch", {
        method: "POST",
        body: JSON.stringify({ membershipId: fixture.bobMember.id })
      })
    );

    expect(res.status).toBe(404);
    expect(cookieState.writes).toEqual([]);
  });

  it("switches between memberships owned by the signed-in user", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await switchHousehold(
      new NextRequest("http://localhost/api/household/switch", {
        method: "POST",
        body: JSON.stringify({ membershipId: fixture.aliceSecondMember.id })
      })
    );

    expect(res.status).toBe(200);
    expect(cookieState.values.get(ACTIVE_HOUSEHOLD_COOKIE)).toBe(
      fixture.aliceSecondMember.id
    );

    const householdRes = await getHousehold();
    const household = await householdRes.json();
    expect(household.id).toBe(fixture.aliceSecond.id);
  });

  it("does not let a user mutate another household's account", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await patchAccount(
      new NextRequest(
        `http://localhost/api/accounts/${fixture.bobAccount.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "Taken over" })
        }
      ),
      { params: Promise.resolve({ id: fixture.bobAccount.id }) }
    );

    expect(res.status).toBe(404);
    const account = await prisma.bankAccount.findUniqueOrThrow({
      where: { id: fixture.bobAccount.id }
    });
    expect(account.name).toBe("Bob checking");
  });

  it("rejects cross-tenant PATCH across protected mutable resources", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const cases: Array<[string, IdRouteHandler, string, unknown]> = [
      ["account", patchAccount, fixture.bobAccount.id, { name: "Taken" }],
      ["category", patchCategory, fixture.bobCategory.id, { name: "Taken" }],
      [
        "category group",
        patchCategoryGroup,
        fixture.bobGroup.id,
        { name: "Taken" }
      ],
      [
        "income earner",
        patchIncomeEarner,
        fixture.bobEarner.id,
        { name: "Taken" }
      ],
      ["budget item", patchBudgetItem, fixture.bobBudgetItem.id, { name: "Taken" }],
      ["transfer", patchTransfer, fixture.bobTransfer.id, { name: "Taken" }],
      ["asset", patchAsset, fixture.bobAsset.id, { name: "Taken" }],
      ["projection", patchProjection, fixture.bobProjection.id, { name: "Taken" }]
    ];

    for (const [name, handler, id, body] of cases) {
      const res = await callIdRoute(handler, "PATCH", id, body);
      expect(res.status, name).toBe(404);
    }
  });

  it("rejects cross-tenant DELETE before reference checks can leak row existence", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const cases: Array<[string, IdRouteHandler, string]> = [
      ["account", deleteAccount, fixture.bobAccount.id],
      ["category", deleteCategory, fixture.bobCategory.id],
      ["category group", deleteCategoryGroup, fixture.bobGroup.id],
      ["income earner", deleteIncomeEarner, fixture.bobEarner.id],
      ["budget item", deleteBudgetItem, fixture.bobBudgetItem.id],
      ["transfer", deleteTransfer, fixture.bobTransfer.id],
      ["asset", deleteAsset, fixture.bobAsset.id],
      ["projection", deleteProjection, fixture.bobProjection.id]
    ];

    for (const [name, handler, id] of cases) {
      const res = await callIdRoute(handler, "DELETE", id, undefined, "?force=true");
      expect(res.status, name).toBe(404);
    }
  });

  it("rejects attaching owned resources to foreign-key rows from another household", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const cases: Array<[string, IdRouteHandler, string, unknown]> = [
      [
        "category group",
        patchCategory,
        fixture.aliceCategory.id,
        { groupId: fixture.bobGroup.id }
      ],
      [
        "budget category",
        patchBudgetItem,
        fixture.aliceBudgetItem.id,
        { categoryId: fixture.bobCategory.id }
      ],
      [
        "budget account",
        patchBudgetItem,
        fixture.aliceBudgetItem.id,
        { accountId: fixture.bobAccount.id }
      ],
      [
        "budget earner",
        patchBudgetItem,
        fixture.aliceBudgetItem.id,
        { incomeEarnerId: fixture.bobEarner.id }
      ],
      [
        "transfer source",
        patchTransfer,
        fixture.aliceTransfer.id,
        { sourceAccountId: fixture.bobAccount.id }
      ],
      [
        "projection account",
        patchProjection,
        fixture.aliceProjection.id,
        { accountId: fixture.bobAccount.id }
      ]
    ];

    for (const [name, handler, id, body] of cases) {
      const res = await callIdRoute(handler, "PATCH", id, body);
      expect(res.status, name).toBe(404);
    }
  });

  it("rejects scheduled transfer currencies that are not pockets on the selected accounts", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await createTransfer(
      jsonRequest("http://localhost/api/transfers", "POST", {
        name: "Invalid currency transfer",
        sourceAccountId: fixture.aliceAccount.id,
        sourceCurrency: "USD",
        targetAccountId: fixture.aliceSavings.id,
        targetCurrency: "CHF",
        amount: "100",
        recurrence: "monthly",
        startDate: "2026-05-25T00:00:00.000Z"
      })
    );

    expect(res.status).toBe(404);
  });

  it("rejects admin config updates from non-admin users", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await patchAdminAuth(
      jsonRequest("http://localhost/api/admin/config/auth", "PATCH", {
        sessionTtlDays: 7
      })
    );

    expect(res.status).toBe(403);
  });

  it("rejects admin user access updates from non-admin users", async () => {
    const fixture = await seedAccessScenario();
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await callIdRoute(
      patchAdminUserAccess,
      "PATCH",
      fixture.bob.id,
      { productTier: "ai" }
    );

    expect(res.status).toBe(403);
  });

  it("lets admins grant product tiers without changing user roles", async () => {
    const fixture = await seedAccessScenario();
    await prisma.user.update({
      where: { id: fixture.alice.id },
      data: { role: "admin" }
    });
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    const res = await callIdRoute(
      patchAdminUserAccess,
      "PATCH",
      fixture.bob.id,
      { productTier: "ai", active: true }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.productTier).toBe("ai");
    expect(body.user.role).toBe("user");

    const bob = await prisma.user.findUniqueOrThrow({
      where: { id: fixture.bob.id },
      select: { productTier: true, role: true }
    });
    expect(bob.productTier).toBe("ai");
    expect(bob.role).toBe("user");

    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          action: "admin_user_access_update",
          userId: fixture.alice.id,
          resourceId: fixture.bob.id
        }
      })
    ).resolves.toBeTruthy();
  });

  it("rate-limits password reset requests by IP", async () => {
    const fixture = await seedAccessScenario();

    for (let i = 0; i < 5; i++) {
      const res = await requestPasswordReset(
        jsonRequest("http://localhost/api/auth/reset-password/request", "POST", {
          email: "alice@example.test"
        })
      );
      expect(res.status).toBe(200);
    }

    const limited = await requestPasswordReset(
      jsonRequest("http://localhost/api/auth/reset-password/request", "POST", {
        email: fixture.alicePrimary.id.replace(/./g, "a") + "@example.test"
      })
    );
    expect(limited.status).toBe(429);
  });

  it("rate-limits verification email requests by user and IP", async () => {
    const fixture = await seedAccessScenario();
    await prisma.user.update({
      where: { email: "alice@example.test" },
      data: { emailVerifiedAt: null }
    });
    setCookies({ [SESSION_COOKIE]: fixture.aliceToken });

    for (let i = 0; i < 5; i++) {
      const res = await requestEmailVerification(
        jsonRequest("http://localhost/api/auth/verify-email/request", "POST")
      );
      expect(res.status).toBe(200);
    }

    const limited = await requestEmailVerification(
      jsonRequest("http://localhost/api/auth/verify-email/request", "POST")
    );
    expect(limited.status).toBe(429);
  });

  it("consumes password reset tokens once and revokes existing sessions", async () => {
    const fixture = await seedAccessScenario();
    const token = randomToken(32);
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: sha256Hex(token),
        userId: (await prisma.user.findUniqueOrThrow({
          where: { email: "alice@example.test" },
          select: { id: true }
        })).id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    const res = await completePasswordReset(
      jsonRequest("http://localhost/api/auth/reset-password/complete", "POST", {
        token,
        password: "new correct horse battery"
      })
    );
    expect(res.status).toBe(200);

    const second = await completePasswordReset(
      jsonRequest("http://localhost/api/auth/reset-password/complete", "POST", {
        token,
        password: "another correct horse"
      })
    );
    expect(second.status).toBe(400);

    expect(await prisma.session.count({ where: { tokenHash: sha256Hex(fixture.aliceToken) } })).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "alice@example.test" }
    });
    expect(await verifyPassword("new correct horse battery", user.passwordHash)).toBe(true);
  });

  it("consumes email verification tokens once", async () => {
    const fixture = await seedAccessScenario();
    const token = randomToken(32);
    const user = await prisma.user.update({
      where: { email: "alice@example.test" },
      data: { emailVerifiedAt: null },
      select: { id: true }
    });
    await prisma.emailVerificationToken.create({
      data: {
        tokenHash: sha256Hex(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    const res = await consumeEmailVerification(
      jsonRequest(`http://localhost/api/auth/verify-email/${token}`, "POST"),
      { params: Promise.resolve({ token }) }
    );
    expect(res.status).toBe(200);

    const second = await consumeEmailVerification(
      jsonRequest(`http://localhost/api/auth/verify-email/${token}`, "POST"),
      { params: Promise.resolve({ token }) }
    );
    expect(second.status).toBe(400);

    const verified = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerifiedAt: true }
    });
    expect(verified.emailVerifiedAt).not.toBeNull();
    expect(fixture.aliceToken).toBeTruthy();
  });
});
