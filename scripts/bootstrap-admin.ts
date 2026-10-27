// Usage: pnpm admin:bootstrap --email you@example.com --name "Your Name"
// The password is read from BOOTSTRAP_ADMIN_PASSWORD or prompted for (input hidden).
import { loadEnvConfig } from "@next/env";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

loadEnvConfig(process.cwd());

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      write(s.startsWith(question) ? s : "");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      "restaurant-ar": { type: "string" },
      "restaurant-en": { type: "string" },
    },
  });
  if (!values.email || !values.name) {
    console.error('Usage: pnpm admin:bootstrap --email you@example.com --name "Your Name"');
    process.exit(2);
  }
  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden("Password (min 10 characters): ");
    const confirm = await promptHidden("Repeat password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(2);
    }
  }

  const { bootstrapAdmin } = await import("../src/server/auth/bootstrap");
  const { sql } = await import("../src/server/db/client");
  try {
    const result = await bootstrapAdmin({
      email: values.email,
      name: values.name,
      password,
      restaurantNameAr: values["restaurant-ar"],
      restaurantNameEn: values["restaurant-en"],
    });
    console.log(`Administrator created (user ${result.userId}).`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
