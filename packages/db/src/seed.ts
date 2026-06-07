import { type AccessLevel, type RbacModule, hashPassword } from "@construction-erp/shared";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { siteMemberPermissions, siteMembers, sites, users } from "./schema";

/**
 * Idempotent seed for the site-as-tenant model. Creates:
 *   - the owner user (is_owner = true) — admin@demo.test by default,
 *   - three sample sites owned by the owner,
 *   - one member user assigned to two of those sites with different access
 *     levels (read-only on one, read+write on another) to demo the switcher.
 *
 * There is no public signup — the owner provisions other users (per site) via
 * the Users module. Run with `pnpm db:seed` (needs DATABASE_URL). Credentials
 * come from env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 */

// Modules a site member is typically granted (the owner always has full access).
const MEMBER_MODULES: RbacModule[] = [
  "dashboard",
  "dpr",
  "inventory",
  "attendance",
  "salary",
  "expenses",
  "purchases",
  "suppliers",
  "reports",
];

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env — rely on the ambient environment.
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed.");

  const ownerEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@demo.test").toLowerCase();
  const ownerPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const ownerName = process.env.SEED_ADMIN_NAME ?? "Jemish";
  const memberEmail = (process.env.SEED_MEMBER_EMAIL ?? "partner@demo.test").toLowerCase();
  const memberPassword = process.env.SEED_MEMBER_PASSWORD ?? "ChangeMe123!";
  const memberName = process.env.SEED_MEMBER_NAME ?? "Jainil";

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  const existing = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  if (existing.length > 0) {
    console.log(`Owner "${ownerEmail}" already exists — skipping seed.`);
    return;
  }

  const ownerHash = await hashPassword(ownerPassword);
  const memberHash = await hashPassword(memberPassword);

  await db.transaction(async (tx) => {
    const [owner] = await tx
      .insert(users)
      .values({ email: ownerEmail, passwordHash: ownerHash, name: ownerName, isOwner: true })
      .returning();
    if (!owner) throw new Error("Failed to create owner.");

    const siteRows = await tx
      .insert(sites)
      .values([
        { ownerUserId: owner.id, name: "Vesu", code: "VESU", city: "Surat", state: "Gujarat" },
        {
          ownerUserId: owner.id,
          name: "Ahmedabad",
          code: "AMD",
          city: "Ahmedabad",
          state: "Gujarat",
        },
        {
          ownerUserId: owner.id,
          name: "Mota Varacha",
          code: "MV",
          city: "Surat",
          state: "Gujarat",
        },
      ])
      .returning();
    const vesu = siteRows.find((s) => s.code === "VESU");
    const mota = siteRows.find((s) => s.code === "MV");
    if (!vesu || !mota) throw new Error("Failed to create sample sites.");

    const [member] = await tx
      .insert(users)
      .values({ email: memberEmail, passwordHash: memberHash, name: memberName, isOwner: false })
      .returning();
    if (!member) throw new Error("Failed to create member.");

    // Member on two sites with different access (demonstrates the switcher).
    const assignments: { siteId: string; level: AccessLevel }[] = [
      { siteId: vesu.id, level: "read" },
      { siteId: mota.id, level: "read_write" },
    ];
    for (const { siteId, level } of assignments) {
      const [m] = await tx.insert(siteMembers).values({ siteId, userId: member.id }).returning();
      if (!m) throw new Error("Failed to create site membership.");
      await tx.insert(siteMemberPermissions).values(
        MEMBER_MODULES.map((module) => ({
          siteMemberId: m.id,
          module,
          accessLevel: level,
        })),
      );
    }
  });

  console.log("Seed complete.");
  console.log(`  Owner:    ${ownerEmail} (is_owner)`);
  console.log("  Sites:    Vesu, Ahmedabad, Mota Varacha");
  console.log(`  Member:   ${memberEmail} (read on Vesu, read+write on Mota Varacha)`);
  console.log(`  Password: ${ownerPassword}`);
  console.log("  -> Change these passwords after first login.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
