import { DEFAULT_ROLE_TEMPLATES, OWNER_ROLE_SLUG, hashPassword } from "@construction-erp/shared";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { companies, rolePermissions, roles, userRoles, users } from "./schema";

/**
 * Idempotent seed: creates the first company, its default system roles (with
 * permissions), and an admin user assigned the Owner role. There is no public
 * signup — the admin then provisions other users via the Users module.
 *
 * Run with `pnpm db:seed` (needs DATABASE_URL). Credentials come from env:
 *   SEED_COMPANY_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 */

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "company";
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env — rely on the ambient environment.
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed.");

  const companyName = process.env.SEED_COMPANY_NAME ?? "Demo Construction Co";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@demo.test").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";
  const slug = slugify(companyName);

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  const existing = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
  if (existing.length > 0) {
    console.log(`Company "${companyName}" (slug: ${slug}) already exists — skipping seed.`);
    return;
  }

  await db.transaction(async (tx) => {
    const [company] = await tx.insert(companies).values({ name: companyName, slug }).returning();
    if (!company) throw new Error("Failed to create company.");

    const slugToRoleId = new Map<string, string>();
    for (const template of DEFAULT_ROLE_TEMPLATES) {
      const [role] = await tx
        .insert(roles)
        .values({
          companyId: company.id,
          name: template.name,
          slug: template.slug,
          description: template.description,
          isSystem: template.isSystem,
        })
        .returning();
      if (!role) throw new Error(`Failed to create role "${template.slug}".`);
      slugToRoleId.set(template.slug, role.id);

      if (template.permissions.length > 0) {
        await tx.insert(rolePermissions).values(
          template.permissions.map((permission) => ({
            roleId: role.id,
            module: permission.module,
            action: permission.action,
            scope: permission.scope,
          })),
        );
      }
    }

    const passwordHash = await hashPassword(adminPassword);
    const [admin] = await tx
      .insert(users)
      .values({
        companyId: company.id,
        email: adminEmail,
        passwordHash,
        name: adminName,
        status: "active",
      })
      .returning();
    if (!admin) throw new Error("Failed to create admin user.");

    const ownerRoleId = slugToRoleId.get(OWNER_ROLE_SLUG);
    if (!ownerRoleId) throw new Error("Owner role was not created.");
    await tx.insert(userRoles).values({
      userId: admin.id,
      roleId: ownerRoleId,
      companyId: company.id,
    });
  });

  console.log("Seed complete.");
  console.log(`  Company:  ${companyName} (${slug})`);
  console.log(`  Admin:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log("  -> Change this password after first login.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
