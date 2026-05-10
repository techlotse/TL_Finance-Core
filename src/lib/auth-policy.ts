import type { User } from "@prisma/client";
import { loadAdminConfig } from "./admin-config";

type VerificationUser = Pick<User, "emailVerifiedAt">;

export function shouldRequireEmailVerification(
  emailVerificationRequired: boolean,
  user: VerificationUser
): boolean {
  return emailVerificationRequired && !user.emailVerifiedAt;
}

export async function isEmailVerificationGateActive(
  user: VerificationUser
): Promise<boolean> {
  const cfg = await loadAdminConfig();
  return shouldRequireEmailVerification(
    cfg.authConfig.emailVerificationRequired,
    user
  );
}

export async function assertEmailVerifiedForAppAccess(
  user: VerificationUser
): Promise<void> {
  if (!(await isEmailVerificationGateActive(user))) return;
  const err = new Error("Email verification required") as Error & {
    status?: number;
  };
  err.status = 403;
  throw err;
}
