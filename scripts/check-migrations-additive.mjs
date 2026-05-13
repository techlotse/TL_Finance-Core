import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "prisma", "migrations");
const destructivePatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+CONSTRAINT\b/i,
  /\bALTER\s+TYPE\b[\s\S]*?\bDROP\s+VALUE\b/i
];

const failures = [];

if (!existsSync(migrationsDir)) {
  failures.push("prisma/migrations directory is missing");
} else {
  for (const dir of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const migration = join(migrationsDir, dir.name, "migration.sql");
    if (!existsSync(migration)) continue;
    const sql = readFileSync(migration, "utf8");
    for (const pattern of destructivePatterns) {
      if (pattern.test(sql)) {
        failures.push(`${dir.name}/migration.sql matches ${pattern}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Non-destructive migration check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Public alpha policy requires additive migrations. Write a separate reviewed data migration when destructive cleanup is unavoidable."
  );
  process.exit(1);
}

console.log("Migration additive-safety check passed.");
