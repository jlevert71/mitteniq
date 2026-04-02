import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Match Next.js local development precedence so Prisma CLI
// uses the same DB credentials as the running app.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Use your *direct* Postgres URL here (not prisma://)
    url: env("DIRECT_DATABASE_URL"),
  },
});