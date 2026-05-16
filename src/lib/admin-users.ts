import type { Prisma, UserRole } from "@/generated/prisma/client";
import { normaliseProductTier, type ProductTier } from "./plans";

export const adminUserAccessSelect = {
  id: true,
  email: true,
  role: true,
  productTier: true,
  active: true,
  emailVerifiedAt: true,
  createdAt: true,
  lastSignInAt: true,
  _count: {
    select: {
      memberships: true,
      sessions: true
    }
  }
} satisfies Prisma.UserSelect;

type AdminUserAccessRow = Prisma.UserGetPayload<{
  select: typeof adminUserAccessSelect;
}>;

export interface AdminUserAccess {
  id: string;
  email: string;
  role: UserRole;
  productTier: ProductTier;
  active: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  membershipCount: number;
  sessionCount: number;
}

export function toAdminUserAccess(user: AdminUserAccessRow): AdminUserAccess {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    productTier: normaliseProductTier(user.productTier),
    active: user.active,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    membershipCount: user._count.memberships,
    sessionCount: user._count.sessions
  };
}
