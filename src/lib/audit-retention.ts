import { prisma } from "./prisma";
import { loadAdminConfig } from "./admin-config";
import { log } from "./logger";

/**
 * Prune AuditLog entries older than the configured retention window.
 * Returns the number of rows deleted. Safe to run repeatedly — uses
 * a deleteMany on ts < cutoff, no row-by-row work.
 *
 * Wire this to:
 *   • a daily cron in the multinode compose, OR
 *   • the schedule plugin if/when we ship a built-in scheduler.
 *
 * Keeping it as a plain helper means it works equally well from a one-shot
 * script: `tsx src/scripts/prune-audit.ts` (when we add it).
 */
export async function pruneAuditLog(): Promise<{
  deleted: number;
  cutoff?: string;
}> {
  const cfg = await loadAdminConfig();
  const days = cfg.observability.retainAuditDays;
  if (!days || days <= 0) {
    return { deleted: 0 };
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { ts: { lt: cutoff } }
  });
  log.info("audit retention pruned", {
    deleted: result.count,
    cutoff: cutoff.toISOString(),
    days
  });
  return { deleted: result.count, cutoff: cutoff.toISOString() };
}
