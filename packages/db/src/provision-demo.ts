import { hashPassword } from "@construction-erp/shared";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { users } from "./schema";

/**
 * Provision one isolated contractor-owner account. The owner then creates their
 * own sites and their own team via the app — nothing is shared between owners.
 *
 * Credentials are required from env (no defaults — a hardcoded password here
 * would be a live account on a real DB):
 *   DEMO_EMAIL, DEMO_PASSWORD (min 12 chars), DEMO_NAME
 *
 * Re-running with the same email rotates that owner's password and leaves their
 * data intact. Safe to run repeatedly.
 *
 *   DEMO_EMAIL=aa@example.com DEMO_PASSWORD=... DEMO_NAME="AA Constructions" \
 *     pnpm --filter @construction-erp/db seed:provision-demo
 */

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required (set it in packages/db/.env or inline).`);
  return value;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (packages/db/.env).");

  const email = requiredEnv("DEMO_EMAIL").toLowerCase();
  const password = requiredEnv("DEMO_PASSWORD");
  if (password.length < 12) throw new Error("DEMO_PASSWORD must be at least 12 characters.");
  const name = requiredEnv("DEMO_NAME");

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  // ── 1. Upsert the demo owner user ──
  let ownerId: string;
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    if (!existing.isOwner) {
      throw new Error(
        `User "${email}" already exists but is NOT an owner. Provision only creates owner accounts. Aborting to avoid conflict.`,
      );
    }
    ownerId = existing.id;
    // Re-hash + update password so you can rotate credentials before each demo.
    const newHash = await hashPassword(password);
    await db
      .update(users)
      .set({ passwordHash: newHash, status: "active" })
      .where(eq(users.id, ownerId));
    console.log(`  Demo owner "${email}" already exists — password updated.`);
  } else {
    const hash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash: hash, name, isOwner: true })
      .returning();
    if (!created) throw new Error("Failed to create demo owner.");
    ownerId = created.id;
    console.log(`  Created demo owner "${email}".`);
  }

  console.log("");
  console.log("Done. Share these credentials with the prospect:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("");
  console.log("To monitor their activity:");
  console.log(`  - Last login:  SELECT last_login_at FROM users WHERE email = '${email}';`);
  console.log(
    `  - Audit trail: SELECT * FROM audit_logs WHERE actor_user_id = '${ownerId}' ORDER BY created_at DESC LIMIT 50;`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("provision-demo failed:", error);
    process.exit(1);
  });
