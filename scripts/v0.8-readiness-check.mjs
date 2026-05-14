import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(name, condition) {
  if (!condition) failures.push(name);
}

function walk(dir) {
  const abs = join(root, dir);
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function has(path, text) {
  return existsSync(join(root, path)) && read(path).includes(text);
}

const pkg = JSON.parse(read("package.json"));
assert("package is at least v0.7.5", /^0\.(7\.[5-9]|8\.)/.test(pkg.version));
assert("CI runs migration additive-safety check", pkg.scripts.ci.includes("test:migrations"));
assert("CI runs v0.8 readiness check", pkg.scripts.ci.includes("test:readiness:v0.8"));
assert("CI runs security audit check", pkg.scripts.ci.includes("test:security"));

assert("SaaS admin page remains under /admin", existsSync(join(root, "src", "app", "admin", "layout.tsx")));
assert("SaaS admin API remains under /api/admin", existsSync(join(root, "src", "app", "api", "admin")));
assert("Admin navigation exposes payments", has("src/app/admin/admin-subnav.tsx", "/admin/payments"));
assert("No second SaaS admin app route is present", !existsSync(join(root, "src", "app", "saas-admin")));

assert("Payment admin route exists", existsSync(join(root, "src", "app", "api", "admin", "config", "payments", "route.ts")));
assert("User checkout route exists", existsSync(join(root, "src", "app", "api", "billing", "checkout", "route.ts")));
assert("Settings exposes billing tab", has("src/app/settings/settings-tabs.tsx", "billing"));
assert("Billing route tracks Stripe client reference", has("src/lib/billing.ts", "client_reference_id"));
assert("Payment config is stored in admin config", has("src/lib/admin-config.ts", "paymentConfig"));
assert("Payment docs mention Stripe Payment Links", has("docs/operations/PAYMENTS_ALPHA.md", "Stripe Payment Links"));

assert("Multi-host HA compose file exists", existsSync(join(root, "docker-compose.ha.yml")));
assert("HA nginx template exists", existsSync(join(root, "deploy", "ha", "nginx.conf.template")));
const haCompose = read("docker-compose.ha.yml");
for (const profile of ["lb", "app", "db-primary", "db-replica"]) {
  assert(`HA compose has ${profile} profile`, haCompose.includes(`\"${profile}\"`));
}
assert("HA compose supports external DATABASE_URL", haCompose.includes("${DATABASE_URL:?"));
assert("HA compose requires APP_BASE_URL", haCompose.includes("${APP_BASE_URL:?"));
assert("HA compose can bind DB on a separate host", haCompose.includes("TLFC_DB_BIND"));
assert("HA compose can run same-node app upstreams", haCompose.includes("app-1:3000"));
assert("HA deployment runbook exists", existsSync(join(root, "docs", "operations", "HA_DEPLOYMENT.md")));
assert("HA runbook documents LB to app to DB", has("docs/operations/HA_DEPLOYMENT.md", "Person -> LB -> HA web -> HA DB"));

assert("Import route accepts older supported export versions", has("src/app/api/household/import/route.ts", "payload.version > HOUSEHOLD_EXPORT_VERSION"));
assert("Import implementation rejects only newer export versions", has("src/lib/household-export.ts", "payload.version > HOUSEHOLD_EXPORT_VERSION"));
assert("Import implementation defaults to merge mode", has("src/app/api/household/import/route.ts", "body.mode === \"replace\" ? \"replace\" : \"merge\""));
assert("Migration additive-safety script exists", existsSync(join(root, "scripts", "check-migrations-additive.mjs")));

const apiRouteFiles = walk(join("src", "app", "api")).filter((file) =>
  file.endsWith(`${sep}route.ts`)
);
for (const file of apiRouteFiles) {
  const normal = `${sep}${file}`;
  if (normal.includes(`${sep}api${sep}health${sep}`)) continue;
  if (normal.includes(`${sep}api${sep}auth${sep}`)) continue;
  const text = read(file);
  assert(
    `${file} declares an auth/tenant/admin guard`,
    [
      "getActiveHousehold",
      "getActiveHouseholdId",
      "requireAdminApi",
      "requireSession",
      "getSession"
    ].some((guard) => text.includes(guard))
  );
}

if (failures.length > 0) {
  console.error("v0.8 readiness check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("v0.8 readiness check passed.");
