import { hashPassword } from "@construction-erp/shared";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { users } from "./schema";

/**
 * One-off: re-point the existing owner to new login credentials. The seed is
 * idempotent (skips when the owner exists), so changing SEED_ADMIN_* in .env
 * does not touch an already-seeded admin — this updates that row in place.
 *
 * Finds the current owner by old email if present, else the sole is_owner user,
 * and sets email + password hash from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 */
async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const newEmail = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase();
  const newPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!newEmail || !newPassword)
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD required.");

  const oldEmail = (process.env.OLD_ADMIN_EMAIL ?? "admin@demo.test").toLowerCase();

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  // Prefer the known old email; fall back to the single owner account.
  let [owner] = await db.select().from(users).where(eq(users.email, oldEmail)).limit(1);
  if (!owner) {
    [owner] = await db.select().from(users).where(eq(users.isOwner, true)).limit(1);
  }
  if (!owner) throw new Error("No owner user found to update.");

  // Guard: if the target email already belongs to a different user, stop.
  const [clash] = await db.select().from(users).where(eq(users.email, newEmail)).limit(1);
  if (clash && clash.id !== owner.id) {
    throw new Error(`Email ${newEmail} is already used by another user — aborting.`);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ email: newEmail, passwordHash }).where(eq(users.id, owner.id));

  console.log(`Updated owner ${owner.email} → ${newEmail} (password reset).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
