-- Product tiers for the commercial offering and sealed OpenAI admin config.

CREATE TYPE "ProductTier" AS ENUM ('core', 'smart', 'ai');

ALTER TABLE "User"
  ADD COLUMN "productTier" "ProductTier" NOT NULL DEFAULT 'core';

ALTER TABLE "AdminConfig"
  ADD COLUMN "aiConfig" JSONB NOT NULL DEFAULT '{}';

UPDATE "AdminConfig"
SET "aiConfig" = '{"enabled": false, "provider": "openai", "model": "gpt-5.4-mini"}'
WHERE "id" = 'singleton';
