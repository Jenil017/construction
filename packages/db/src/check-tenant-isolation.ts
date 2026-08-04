import { hashPassword } from "@construction-erp/shared";
import { eq, inArray } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import { siteMembers, sites, users } from "./schema";

/**
 * End-to-end tenant isolation check against a running API.
 *
 * Multiple unrelated contractors share one deployment, so "AA must not reach
 * BB's data" is the single assumption the whole product rests on. This drives
 * the real HTTP API (not the query layer) so the middleware chain is exercised
 * too, provisioning two throwaway owners and having one attack the other.
 *
 * The `users` table is the interesting part: it is the one table with no
 * `siteId`, and email is globally unique — so it is both the place a lookup can
 * cross tenants and the place a mere *error message* can disclose that a rival
 * contractor's staff exist. Both are asserted below.
 *
 *   pnpm --filter @construction-erp/api dev        # in another terminal
 *   pnpm --filter @construction-erp/db check:isolation
 *
 * Needs DATABASE_URL (packages/db/.env) pointed at the same DB as the API.
 * Every row it creates is removed again, including on failure.
 */

const API = process.env.API_URL ?? "http://127.0.0.1:8787";
const PERMS = [{ module: "dpr", level: "read_write" }];

let failures = 0;
function check(name: string, pass: boolean, detail = ""): void {
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

interface ApiOptions {
  token?: string;
  siteId?: string;
  method?: string;
  body?: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader
async function api(path: string, options: ApiOptions = {}): Promise<{ status: number; json: any }> {
  const { token, siteId, method = "GET", body } = options;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (siteId) headers["X-Site-Id"] = siteId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response (shouldn't happen; leave null so assertions fail loudly)
  }
  return { status: res.status, json };
}

async function login(email: string, password: string) {
  const { status, json } = await api("/auth/login", { method: "POST", body: { email, password } });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status}`);
  return json.data;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  const tag = crypto.randomUUID().slice(0, 8);
  const PW = "IsolationCheck123!";
  const aaEmail = `aa-${tag}@isolation.test`;
  const bbEmail = `bb-${tag}@isolation.test`;
  const bbStaffEmail = `bbstaff-${tag}@isolation.test`;
  const createdUserIds: string[] = [];
  const createdSiteIds: string[] = [];

  try {
    const hash = await hashPassword(PW);
    const owners: { email: string; name: string }[] = [
      { email: aaEmail, name: "AA Owner" },
      { email: bbEmail, name: "BB Owner" },
    ];
    for (const { email, name } of owners) {
      const [u] = await db
        .insert(users)
        .values({ email, passwordHash: hash, name, isOwner: true })
        .returning();
      if (!u) throw new Error("failed to provision test owner");
      createdUserIds.push(u.id);
    }

    const aa = await login(aaEmail, PW);
    const bb = await login(bbEmail, PW);

    // Both owners deliberately use the SAME site code — legal since 0014.
    const mkSite = async (token: string, name: string): Promise<string> => {
      const { status, json } = await api("/sites", {
        method: "POST",
        token,
        body: { name, code: "VESU" },
      });
      if (status !== 201) throw new Error(`site create failed: ${status}`);
      createdSiteIds.push(json.data.id);
      return json.data.id;
    };
    const aaSite = await mkSite(aa.accessToken, `AA Site ${tag}`);
    const bbSite = await mkSite(bb.accessToken, `BB Site ${tag}`);
    check("both owners can use the same site code 'VESU'", true);

    // BB hires a staff member on BB's site. Re-login so the token carries the new site.
    const bbFresh = await login(bbEmail, PW);
    const staff = await api("/users", {
      method: "POST",
      token: bbFresh.accessToken,
      siteId: bbSite,
      body: { name: "BB Staff", email: bbStaffEmail, password: PW, permissions: PERMS },
    });
    if (staff.status !== 201) throw new Error(`BB staff create failed: ${staff.status}`);
    createdUserIds.push(staff.json.data.id);
    const bbStaffId: string = staff.json.data.id;

    // ── Attacks. AA is authenticated on AA's own site throughout. ──
    const aaFresh = await login(aaEmail, PW);
    const asAA = { token: aaFresh.accessToken, siteId: aaSite };

    const attach = await api("/users", {
      method: "POST",
      ...asAA,
      body: { name: "Stolen", email: bbStaffEmail, password: PW, permissions: PERMS },
    });
    check(
      "AA cannot attach BB's staff by email",
      attach.status === 409,
      `got ${attach.status} ${attach.json?.error?.code ?? ""}`,
    );

    // The refusal must not confirm the address exists: a foreign email and an
    // unused one have to fail identically, or the difference is an oracle.
    const unused = await api("/users", {
      method: "POST",
      ...asAA,
      body: {
        name: "X",
        email: `nobody-${crypto.randomUUID()}@isolation.test`,
        permissions: PERMS,
      },
    });
    const foreign = await api("/users", {
      method: "POST",
      ...asAA,
      body: { name: "X", email: bbStaffEmail, permissions: PERMS },
    });
    check(
      "no-password probe is indistinguishable for foreign vs unused email",
      unused.status === foreign.status &&
        unused.json?.error?.code === foreign.json?.error?.code &&
        unused.json?.error?.message === foreign.json?.error?.message,
      `unused=${unused.status}/${unused.json?.error?.code} foreign=${foreign.status}/${foreign.json?.error?.code}`,
    );

    const msg = JSON.stringify(attach.json ?? {}).toLowerCase();
    check(
      "refusal message names no other tenant",
      !msg.includes("already registered") && !msg.includes("another"),
      msg.slice(0, 120),
    );

    const reset = await api(`/users/${bbStaffId}`, {
      method: "PATCH",
      ...asAA,
      body: { password: "AttackerOwned123!" },
    });
    check(
      "AA cannot PATCH BB's staff account",
      reset.status === 404 || reset.status === 409,
      `got ${reset.status}`,
    );

    // The decisive assertion: BB's staff can still sign in with their own password.
    const stillWorks = await api("/auth/login", {
      method: "POST",
      body: { email: bbStaffEmail, password: PW },
    });
    check(
      "BB's staff password is unchanged",
      stillWorks.status === 200,
      `got ${stillWorks.status}`,
    );

    const aaSites = await api("/sites", { token: aaFresh.accessToken });
    check(
      "GET /sites returns only AA's sites",
      // biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader
      !(aaSites.json?.data ?? []).map((s: any) => s.id).includes(bbSite),
    );

    const aaUsers = await api("/users?pageSize=100", asAA);
    check(
      "GET /users never lists BB's staff",
      // biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader
      !(aaUsers.json?.data ?? []).map((u: any) => u.email).includes(bbStaffEmail),
    );

    const search = await api(`/users?search=${encodeURIComponent(bbStaffEmail)}`, asAA);
    check("searching BB's staff email returns nothing", (search.json?.data ?? []).length === 0);

    const crossSite = await api("/users", { token: aaFresh.accessToken, siteId: bbSite });
    check(
      "AA passing BB's X-Site-Id is rejected",
      crossSite.status === 403,
      `got ${crossSite.status}`,
    );
  } finally {
    if (createdUserIds.length > 0) {
      await db.delete(siteMembers).where(inArray(siteMembers.userId, createdUserIds));
    }
    for (const id of createdSiteIds) await db.delete(sites).where(eq(sites.id, id));
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    console.log("\n  (test rows cleaned up)");
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("isolation check errored:", error);
  process.exit(1);
});
