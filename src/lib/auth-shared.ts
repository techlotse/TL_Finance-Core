/**
 * Constants safe to import from the Edge runtime (middleware). Anything that
 * needs bcrypt or Prisma stays in src/lib/auth.ts which is Node-only.
 */
export const SESSION_COOKIE = "tlfc_session";
