import { hashPassword } from "@construction-erp/shared";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { users } from "./schema";

/**
 * Provision a fully-isolated demo environment for a prospect.
 * Defaults to kalpeshkumar / kalpeshkumar@gmail.com / kalpeshkumar123.
 * Override via env vars: DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME.
 *
 * Re-running with the same email re-seeds data (wipes + refills) but
 * leaves the user and sites intact. Safe to run repeatedly for a refresh.
 *
 *   pnpm --filter @construction-erp/db seed:provision-demo
 */

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (packages/db/.env).");

  const email = (process.env.DEMO_EMAIL ?? "kalpeshkumar@gmail.com").toLowerCase().trim();
  const password = process.env.DEMO_PASSWORD ?? "kalpeshkumar123";
  const name = (process.env.DEMO_NAME ?? "Kalpeshkumar").trim();

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  // ── 1. Upsert the demo owner user ──
  let ownerId: string;
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    if (!existing.isOwner) {
      throw new Error(
        `User "${email}" already exists but is NOT an owner. ` +
        "Provision only creates owner accounts. Aborting to avoid conflict.",
      );
    }
    ownerId = existing.id;
    // Re-hash + update password so you can rotate credentials before each demo.
    const newHash = await hashPassword(password);
    await db.update(users).set({ passwordHash: newHash, status: "active" }).where(eq(users.id, ownerId));
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
  console.log(`  - Audit trail: SELECT * FROM audit_logs WHERE actor_user_id = '${ownerId}' ORDER BY created_at DESC LIMIT 50;`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("provision-demo failed:", error);
    process.exit(1);
  });
