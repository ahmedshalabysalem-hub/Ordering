import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// URL",
    }),
  BETTER_AUTH_SECRET: z.string().min(32, { message: "BETTER_AUTH_SECRET must be at least 32 characters" }),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  // Where uploaded menu images are stored (ADR-011). Use a persistent volume in deployment.
  UPLOAD_DIR: z.string().min(1).default("./storage/uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
