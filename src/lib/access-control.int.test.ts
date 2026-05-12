import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_HOUSEHOLD_COOKIE } from "@/lib/active-household";
import { SESSION_COOKIE, createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET as getHousehold } from "@/app/api/household/route";
import { PATCH as patchAccount } from "@/app/api/accounts/[id]/route";
import { POST as switchHousehold } from "@/app/api/household/switch/route";

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

  const [aliceAccount, bobAccount] = await Promise.all([
    prisma.bankAccount.create({
      data: { householdId: alicePrimary.id, name: "Alice checking" }
    }),
    prisma.bankAccount.create({
      data: { householdId: bobHousehold.id, name: "Bob checking" }
    })
  ]);

  const aliceSession = await createSession(alice.id);
  const bobSession = await createSession(bob.id);

  return {
    alicePrimary,
    aliceSecond,
    bobHousehold,
    alicePrimaryMember,
    aliceSecondMember,
    bobMember,
    aliceAccount,
    bobAccount,
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

describe("v0.6 household access controls", () => {
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
    expect(body.id).toBe(fixture.alicePrimary.id);
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
});
