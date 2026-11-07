import { defineConfig } from "drizzle-kit";
import { enforceVerifyFull } from "./src/lib/database-url";

export default defineConfig({
  schema: "./src/infrastructure/persistence/drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: enforceVerifyFull(
      process.env.DATABASE_URL ?? "postgres://estomasystech:estomasystech@localhost:5432/estomasystech",
    ),
  },
});
