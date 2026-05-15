import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(name, condition) {
  if (!condition) failures.push(name);
}

function has(path, text) {
  return existsSync(join(root, path)) && read(path).includes(text);
}

const pkg = JSON.parse(read("package.json"));
assert("package is at least v0.7.7", /^0\.(7\.[7-9]|8\.)/.test(pkg.version));

const dockerfile = read("Dockerfile");
assert("Dockerfile uses Node 24 runtime", dockerfile.includes("NODE_VERSION=24."));
assert("Dockerfile pins npm with fixed picomatch", dockerfile.includes("NPM_VERSION=11.14.1"));
assert("Dockerfile upgrades global npm before install/build", dockerfile.includes("npm install -g \"npm@${NPM_VERSION}\""));

const workflow = read(".github/workflows/docker-publish.yml");
assert("GitHub Actions tests on Node 24", workflow.includes("node-version: 24"));

assert("production entrypoint requires APP_BASE_URL", has("scripts/docker-entrypoint.sh", "APP_BASE_URL must be set"));
assert("single-node compose requires APP_BASE_URL", has("docker-compose.yml", "${APP_BASE_URL:?"));
assert("multinode compose requires APP_BASE_URL", has("docker-compose-multinode.yml", "${APP_BASE_URL:?"));
assert("HA compose requires APP_BASE_URL", has("docker-compose.ha.yml", "${APP_BASE_URL:?"));

assert("middleware checks same-origin unsafe requests", has("src/middleware.ts", "isSameOriginUnsafeRequest"));
assert("middleware emits X-Frame-Options", has("src/middleware.ts", "X-Frame-Options"));
assert("signin next path is sanitized", has("src/app/signin/signin-form.tsx", "safeNextPath"));

for (const path of [
  "src/app/api/auth/signup/route.ts",
  "src/app/api/auth/reset-password/request/route.ts",
  "src/app/api/auth/verify-email/request/route.ts"
]) {
  assert(`${path} uses trusted public origin`, has(path, "publicAppOrigin"));
}

assert("mailer omits body from production fallback logs", has("src/lib/mailer.ts", "NODE_ENV === \"production\" ? {} : { body"));
assert("billing enforces Stripe Payment Link domains", has("src/lib/billing.ts", "isAllowedStripePaymentLinkUrl"));
assert("billing enforces Stripe portal domains", has("src/lib/billing.ts", "isAllowedStripeBillingPortalUrl"));
assert("destructive import requires server confirmation", has("src/app/api/household/import/route.ts", "confirmReplace"));
assert("backup runs have distinct audit action", has("src/lib/audit.ts", "\"backup_run\""));
assert("signup uses serializable first-admin transaction", has("src/app/api/auth/signup/route.ts", "TransactionIsolationLevel.Serializable"));

if (failures.length > 0) {
  console.error("Security audit check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security audit check passed.");
