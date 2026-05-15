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

assert("package-lock.json exists", existsSync(join(root, "package-lock.json")));

const dockerfile = read("Dockerfile");
const forbiddenNpmInstall = dockerfile
  .split(/\r?\n/)
  .some(
    (line) =>
      /\bRUN\s+npm install(\s|$)/.test(line) &&
      !line.includes('npm install -g "npm@${NPM_VERSION}"')
  );
assert("Dockerfile uses npm ci", dockerfile.includes("RUN npm ci"));
assert("Dockerfile uses Node 24 base image", dockerfile.includes("NODE_VERSION=24."));
assert("Dockerfile pins fixed npm version", dockerfile.includes("NPM_VERSION=11.14.1"));
assert(
  "Dockerfile does not fall back to npm install",
  !forbiddenNpmInstall
);
assert(
  "Docker image validates runtime env before start",
  dockerfile.includes("docker-entrypoint.sh") &&
    existsSync(join(root, "scripts", "docker-entrypoint.sh"))
);
assert(
  "Docker image includes pg_dump support",
  dockerfile.includes("postgresql-client")
);

const pkg = JSON.parse(read("package.json"));
assert("CI includes release readiness check", pkg.scripts.ci.includes("test:release"));

const releaseWorkflow = read(".github/workflows/docker-publish.yml");
assert("GitHub workflow creates releases after main verification", releaseWorkflow.includes("github-release:"));
assert("GitHub releases use the package changelog entry", releaseWorkflow.includes("scripts/release-notes.mjs --out"));
assert("Release Docker build includes package semver tags", releaseWorkflow.includes("type=raw,value=${{ needs.release-plan.outputs.version }}"));

const compose = read("docker-compose.yml");
const multinode = read("docker-compose-multinode.yml");
for (const [name, text] of [
  ["single-node compose", compose],
  ["multinode compose", multinode]
]) {
  assert(`${name} requires APP_SECRET`, text.includes("${APP_SECRET:?"));
  assert(`${name} requires APP_BASE_URL`, text.includes("${APP_BASE_URL:?"));
  assert(`${name} requires DB_PASSWORD`, text.includes("${DB_PASSWORD:?"));
  assert(`${name} has no APP_SECRET fallback`, !text.includes("change-me"));
  assert(`${name} has no default DB password fallback`, !text.includes(":-budget"));
  assert(`${name} has no changeme fallback`, !text.includes("changeme"));
}
assert("multinode compose requires Redis password", multinode.includes("${REDIS_PASSWORD:?"));
assert(
  "multinode compose does not publish app debug ports",
  !multinode.includes("3001:3000") && !multinode.includes("3002:3000")
);
assert(
  "multinode compose does not publish data stores",
  !multinode.includes("5432:5432") &&
    !multinode.includes("5433:5432") &&
    !multinode.includes("6379:6379")
);

const signupForm = read("src/app/signup/signup-form.tsx");
assert("signup client honors API next route", signupForm.includes("json.next"));

const household = read("src/lib/household.ts");
assert(
  "household access enforces email verification",
  household.includes("assertEmailVerifiedForAppAccess")
);

const backupRunner = read("src/lib/backup-runner.ts");
assert(
  "backup runner does not shell-compose pg_dump",
  !backupRunner.includes('spawn(\n      "sh"') && !backupRunner.includes("pg_dump |")
);

const apiRouteFiles = walk(join("src", "app", "api")).filter((file) =>
  file.endsWith(`${sep}route.ts`)
);
const publicApiPrefixes = [
  `${sep}api${sep}health${sep}`,
  `${sep}api${sep}auth${sep}`
];
const acceptedGuards = [
  "getActiveHousehold",
  "getActiveHouseholdId",
  "requireAdminApi",
  "requireSession",
  "getSession"
];

for (const file of apiRouteFiles) {
  const normal = `${sep}${file}`;
  if (publicApiPrefixes.some((prefix) => normal.includes(prefix))) continue;
  const text = read(file);
  assert(
    `${file} declares an auth/tenant guard`,
    acceptedGuards.some((guard) => text.includes(guard))
  );
}

if (failures.length > 0) {
  console.error("Public readiness check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public readiness check passed.");
