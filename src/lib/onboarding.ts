import { prisma } from "./prisma";
import { getCategoryPreset, type CategoryPreset } from "./category-presets";

export async function createHouseholdForUser(opts: {
  userId: string;
  householdName: string;
  baseCurrency: string;
  earners: Array<{ name: string }>;
  categoryPreset: CategoryPreset;
}) {
  const preset = getCategoryPreset(opts.categoryPreset);

  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: opts.householdName,
        baseCurrency: opts.baseCurrency
      }
    });

    const membership = await tx.householdMember.create({
      data: {
        householdId: household.id,
        userId: opts.userId,
        role: "owner"
      }
    });

    if (opts.earners.length) {
      await tx.incomeEarner.createMany({
        data: opts.earners.map((e) => ({
          householdId: household.id,
          name: e.name
        }))
      });
    }

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

    return { household, membership };
  });
}

/**
 * Create a household for a user who has just signed up. Wraps everything in
 * a transaction so a failure half-way through doesn't leave a half-built
 * household lying around.
 */
export async function applyOnboarding(opts: {
  userId: string;
  householdName: string;
  baseCurrency: string;
  earners: Array<{ name: string }>;
  categoryPreset: CategoryPreset;
}) {
  // Defensive: a user might re-run onboarding after a partial failure. If
  // they already own a household, return it instead of creating a duplicate.
  const existing = await prisma.householdMember.findFirst({
    where: { userId: opts.userId },
    include: { household: true }
  });
  if (existing) {
    return existing.household;
  }

  const created = await createHouseholdForUser(opts);
  return created.household;
}
