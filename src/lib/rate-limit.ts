import { prisma } from "./prisma";
import type { AuditAction } from "./audit";

interface AuditRateLimitOptions {
  action: AuditAction;
  ipHash?: string | null;
  userId?: string | null;
  windowMs: number;
  max: number;
  message: string;
}

export async function assertAuditRateLimit({
  action,
  ipHash,
  userId,
  windowMs,
  max,
  message
}: AuditRateLimitOptions): Promise<void> {
  const subjects = [
    ipHash ? { ipHash } : null,
    userId ? { userId } : null
  ].filter(Boolean) as Array<{ ipHash: string } | { userId: string }>;

  if (subjects.length === 0) return;

  const recent = await prisma.auditLog.count({
    where: {
      action,
      ts: { gte: new Date(Date.now() - windowMs) },
      OR: subjects
    }
  });

  if (recent >= max) {
    const err = new Error(message) as Error & { status?: number };
    err.status = 429;
    throw err;
  }
}
