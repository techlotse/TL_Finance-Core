import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness + readiness check used by nginx upstream health checks and
 * docker-compose healthcheck directives. Returns 200 when the app and
 * database are both reachable, 503 when the database is down.
 *
 * Intentionally requires no authentication so the load balancer can
 * poll it without credentials.
 */
export async function GET() {
  const ts = new Date().toISOString();

  try {
    // Minimal round-trip that exercises the DB connection pool.
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok", db: "ok", ts },
      { status: 200 }
    );
  } catch (err) {
    log.error("[health] DB check failed", {
      err: err instanceof Error ? err.message : String(err)
    });
    return NextResponse.json(
      { status: "degraded", db: "error", ts },
      { status: 503 }
    );
  }
}
