import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Use your *direct* Postgres URL here (not prisma://)
    url: env("DIRECT_DATABASE_URL"),
  },
});