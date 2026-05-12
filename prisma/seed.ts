import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth";
import { getCategoryPreset, type CategoryPreset } from "../src/lib/category-presets";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 300_000
});

const prisma = new PrismaClient({ adapter });

/**
 * Seed strategy
 * -------------
 * The legacy "default-household" seed (a hardcoded householdId everyone
 * shared) has been retired now that auth + tenant scoping is in place.
 *
 * Instead, when SEED_DEMO_USER=true (or in dev), we provision a single
 * dev/admin user, sign them up to a household with the Swiss preset and
 * a couple of common accounts. In production deploys we just exit cleanly
 * — every real user signs up via the public /signup flow and is walked
 * through the onboarding wizard, which seeds their own preset.
 *
 * Env knobs:
 *   SEED_DEMO_USER       "true" to provision a demo user (default: dev only)
 *   SEED_USER_EMAIL      defaults to demo@example.test
 *   SEED_USER_PASSWORD   defaults to a random throwaway you must reset
 *   SEED_PRESET          one of swiss | generic | german | french (default swiss)
 */

async function main() {
  const isDev = process.env.NODE_ENV !== "production";
  const wantsDemo =
    process.env.SEED_DEMO_USER === "true" ||
    (isDev && process.env.SEED_DEMO_USER !== "false");

  if (!wantsDemo) {
    console.log(
      "Skipping demo seed (SEED_DEMO_USER is not 'true' and not in dev). " +
        "Sign up via /signup to provision a household."
    );
    return;
  }

  const email = (process.env.SEED_USER_EMAIL ?? "demo@example.test")
    .trim()
    .toLowerCase();
  const password =
    process.env.SEED_USER_PASSWORD ?? "ChangeMe-" + Math.random().toString(36).slice(2, 12);
  const presetName = (process.env.SEED_PRESET ?? "swiss") as CategoryPreset;
  const preset = getCategoryPreset(presetName);

  // First registered user gets admin so they can reach the SaaS admin pages.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo user ${email} already exists — leaving alone.`);
    return;
  }
  const userCount = await prisma.user.count();
  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: userCount === 0 ? "admin" : "user"
      }
    });

    const household = await tx.household.create({
      data: { name: "Demo Household", baseCurrency: "CHF" }
    });

    await tx.householdMember.create({
      data: { userId: user.id, householdId: household.id, role: "owner" }
    });

    await tx.incomeEarner.createMany({
      data: [
        { householdId: household.id, name: "Person 1" },
        { householdId: household.id, name: "Person 2" }
      ]
    });

    let groupSort = 0;
    for (const group of preset) {
      const created = await tx.categoryGroup.create({
        data: {
          householdId: household.id,
          name: group.name,
          sortOrder: groupSort
        }
      });
      let catSort = 0;
      await tx.category.createMany({
        data: group.categories.map((name) => ({
          householdId: household.id,
          groupId: created.id,
          name,
          type: group.type,
          sortOrder: catSort++
        }))
      });
      groupSort++;
    }

    await tx.bankAccount.create({
      data: {
        householdId: household.id,
        name: "Everyday Account",
        institution: "Demo Bank",
        accountType: "current",
        currencies: {
          create: [{ currency: "CHF", openingBalance: "0", currentBalance: "0" }]
        }
      }
    });

    await tx.bankAccount.create({
      data: {
        householdId: household.id,
        name: "Multi-Currency Wallet",
        institution: "Demo Wallet",
        accountType: "current",
        currencies: {
          create: [
            { currency: "CHF", openingBalance: "0", currentBalance: "0" },
            { currency: "EUR", openingBalance: "0", currentBalance: "0" }
          ]
        }
      }
    });

    return { user, household };
  });

  console.log(
    `Seeded demo user ${result.user.email} (role=${result.user.role}) ` +
      `with household "${result.household.name}" and the ${presetName} preset.`
  );
  if (!process.env.SEED_USER_PASSWORD) {
    console.log(`Generated demo password (rotate before any real use): ${password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
