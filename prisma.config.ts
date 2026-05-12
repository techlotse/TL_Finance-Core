import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/tl_finance_core";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // `prisma generate` runs during Docker image build before runtime env is
    // injected. Runtime entrypoint/compose checks still require DATABASE_URL.
    url: databaseUrl
  }
});
