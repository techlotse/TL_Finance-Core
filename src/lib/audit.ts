import { prisma } from "./prisma";
import { log } from "./logger";

/**
 * Append-only audit log. Reads come through the admin observability page.
 * Writes are deliberately fire-and-forget: an audit failure must never break
 * the user-facing request.
 */
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "soft_delete"
  | "signin"
  | "signin_failed"
  | "signout"
  | "signup"
  | "password_reset_request"
  | "password_reset_complete"
  | "email_verification_request"
  | "email_verified"
  | "ai_advice_generate"
  | "billing_checkout_start"
  | "admin_mail_test"
  | "admin_config_update";

export interface AuditEntry {
  action: AuditAction;
  userId?: string | null;
  householdId?: string | null;
  resourceType?: string;
  resourceId?: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId ?? null,
        householdId: entry.householdId ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipHash: entry.ipHash ?? null,
        metadata: entry.metadata ? (entry.metadata as object) : undefined
      }
    });
  } catch (err) {
    log.error("audit write failed", {
      action: entry.action,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}
