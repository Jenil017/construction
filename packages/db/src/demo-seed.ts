import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { eq } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import {
  attendance,
  dpr,
  dprPhotos,
  expenses,
  invoiceItems,
  invoices,
  materials,
  purchaseItems,
  purchases,
  salaryPayments,
  siteSales,
  sites,
  stockMovements,
  suppliers,
  users,
  workerAdvances,
  workerCategories,
  workers,
} from "./schema";

/**
 * Demo / showcase data for ONE site so the whole app can be reviewed with realistic
 * volumes covering the LAST ONE MONTH. Every module is populated — including real DPR
 * photos uploaded to R2 (so they display in the app) and GST/non-GST invoices.
 *
 * Behaviour: it WIPES the target site's existing business data first, then reseeds a
 * clean 30-day set. Auth/sites/users are never touched. Run with
 * `pnpm --filter @construction-erp/db seed:demo` (needs packages/db/.env DATABASE_URL).
 * Safe to delete; never used in production.
 *
 * DPR photos: R2 config (account id + bucket) is read from apps/api/wrangler.jsonc and
 * the S3 API keys from apps/api/.dev.vars — the same source of truth the API uses — so
 * no secrets are duplicated into packages/db/.env. If R2 isn't reachable the seed still
 * inserts everything else and just skips the photo bytes (logging a warning).
 */

// ─── tiny helpers ────────────────────────────────────────────────────────────────
const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
const chance = (p: number) => Math.random() < p;
const m2 = (n: number) => n.toFixed(2);
const q3 = (n: number) => n.toFixed(3);

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return isoOf(d);
};
const curMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

// The last 30 calendar days (today back to 29 days ago), working days only (Sundays off).
const WINDOW_DAYS = 30;
const workingDays: string[] = [];
for (let n = WINDOW_DAYS - 1; n >= 0; n--) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  if (d.getDay() === 0) continue; // Sunday off
  workingDays.push(isoOf(d));
}
// Indian financial year for the current date (Apr–Mar), e.g. 2026-04-05 -> "2026-27".
const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const financialYear = `${fyStartYear}-${pad((fyStartYear + 1) % 100)}`;

// ─── reference data ──────────────────────────────────────────────────────────────
const FIRST = [
  "Ramesh",
  "Suresh",
  "Mahesh",
  "Jignesh",
  "Kiran",
  "Naresh",
  "Dinesh",
  "Hardik",
  "Bhavesh",
  "Paresh",
  "Ankit",
  "Rohit",
  "Vijay",
  "Sanjay",
  "Raju",
  "Mukesh",
  "Nilesh",
  "Tushar",
  "Chirag",
  "Manish",
  "Alpesh",
  "Ketan",
  "Pravin",
  "Rakesh",
  "Sandip",
  "Amit",
  "Vishal",
  "Jayesh",
  "Dhaval",
  "Mehul",
  "Nikhil",
  "Ashok",
  "Kishor",
  "Pankaj",
  "Bharat",
  "Girish",
  "Hitesh",
  "Imran",
  "Yusuf",
  "Salim",
  "Arjun",
  "Karan",
  "Deepak",
  "Sunil",
  "Ravi",
  "Manoj",
  "Anil",
];
const LAST = [
  "Patel",
  "Shah",
  "Desai",
  "Mehta",
  "Solanki",
  "Chauhan",
  "Parmar",
  "Rana",
  "Joshi",
  "Trivedi",
  "Vyas",
  "Gohil",
  "Makwana",
  "Rathod",
  "Dave",
  "Bhatt",
  "Modi",
  "Thakkar",
  "Pandya",
  "Vaghela",
];
const CATEGORIES = [
  "Mason",
  "Carpenter",
  "Helper",
  "Electrician",
  "Plumber",
  "Painter",
  "Bar Bender",
  "Welder",
  "Supervisor",
  "Crane Operator",
  "Fitter",
  "Labour",
];
const MATERIALS: { name: string; unit: string; cat: string; cost: number }[] = [
  { name: "OPC Cement 53 Grade", unit: "bag", cat: "Cement", cost: 380 },
  { name: "PPC Cement", unit: "bag", cat: "Cement", cost: 360 },
  { name: "TMT Steel Bar 8mm", unit: "kg", cat: "Steel", cost: 62 },
  { name: "TMT Steel Bar 12mm", unit: "kg", cat: "Steel", cost: 60 },
  { name: "TMT Steel Bar 16mm", unit: "kg", cat: "Steel", cost: 59 },
  { name: "Binding Wire", unit: "kg", cat: "Steel", cost: 75 },
  { name: "River Sand", unit: "cu ft", cat: "Aggregate", cost: 45 },
  { name: "Crushed Sand", unit: "cu ft", cat: "Aggregate", cost: 40 },
  { name: "20mm Aggregate", unit: "cu ft", cat: "Aggregate", cost: 38 },
  { name: "40mm Aggregate", unit: "cu ft", cat: "Aggregate", cost: 36 },
  { name: "Red Bricks", unit: "piece", cat: "Masonry", cost: 8 },
  { name: "AAC Block 600x200x100", unit: "piece", cat: "Masonry", cost: 55 },
  { name: "Concrete Solid Block", unit: "piece", cat: "Masonry", cost: 35 },
  { name: "Vitrified Tiles 2x2", unit: "box", cat: "Finishing", cost: 520 },
  { name: "Wall Putty 40kg", unit: "bag", cat: "Finishing", cost: 680 },
  { name: "Emulsion Paint", unit: "litre", cat: "Finishing", cost: 210 },
  { name: "Primer", unit: "litre", cat: "Finishing", cost: 160 },
  { name: "Waterproofing Compound", unit: "litre", cat: "Finishing", cost: 95 },
  { name: "PVC Pipe 4 inch", unit: "piece", cat: "Plumbing", cost: 240 },
  { name: "CPVC Pipe 1 inch", unit: "piece", cat: "Plumbing", cost: 130 },
  { name: "Electrical Wire 2.5sqmm", unit: "coil", cat: "Electrical", cost: 1150 },
  { name: "Modular Switch Board", unit: "piece", cat: "Electrical", cost: 320 },
];
const HSN_BY_CAT: Record<string, string> = {
  Cement: "2523",
  Steel: "7214",
  Aggregate: "2517",
  Masonry: "6810",
  Finishing: "3209",
  Plumbing: "3917",
  Electrical: "8544",
};
const SUPPLIERS = [
  "Shree Cement Depot",
  "Ambuja Distributors",
  "Patel Hardware Mart",
  "Gujarat Steel Co",
  "Maruti Sand Suppliers",
  "Krishna Aggregates",
  "Balaji Electricals",
  "National Paints House",
  "Surat Pipe & Fittings",
  "Varahi Building Material",
];
const EXP_CATEGORIES = [
  "Labour",
  "Material",
  "Equipment",
  "Transport",
  "Food",
  "Utilities",
  "Miscellaneous",
];
const PAY_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
const BUYERS = [
  "Krishna Traders",
  "Shiv Scrap Dealer",
  "Ambika Enterprise",
  "Jay Ambe Steel",
  "Maruti Traders",
  "Reliable Scrap",
  "Gayatri Recyclers",
  "Om Sai Traders",
  "Hari Om Scrap",
  "Mahalaxmi Traders",
  "Bharat Patel",
  "Sohail Khan",
  "Naresh Bhai",
  "Local Contractor",
];
const CLIENTS = [
  { name: "Shivalik Developers", state: "Gujarat", stateCode: "24", gstin: true },
  { name: "Riverside Infra LLP", state: "Gujarat", stateCode: "24", gstin: true },
  { name: "Metro Housing Pvt Ltd", state: "Maharashtra", stateCode: "27", gstin: true },
  { name: "Ganesh Constructions", state: "Gujarat", stateCode: "24", gstin: true },
  { name: "Bluestone Realty", state: "Rajasthan", stateCode: "08", gstin: true },
  { name: "Kamlesh Bhai (Individual)", state: "Gujarat", stateCode: "24", gstin: false },
];
const DPR_WORK = [
  "Excavation",
  "Footing",
  "Column Casting",
  "Slab Casting",
  "Brickwork",
  "Plastering",
  "Tiling",
  "Painting",
  "Plumbing rough-in",
  "Electrical conduiting",
  "Waterproofing",
  "Curing",
];
const DPR_LOC = [
  "Block A",
  "Block B",
  "Tower 1",
  "Tower 2",
  "Basement",
  "Ground Floor",
  "1st Floor",
  "2nd Floor",
  "Terrace",
  "Parking",
];

// ─── DPR photo generation (self-contained, valid PNG bytes) ───────────────────────
/**
 * Build a small valid PNG (solid colour) with no external deps. A "site photo" only
 * needs to be a real, displayable image for the demo — colour varies per DPR so the
 * gallery isn't monotonous. Pure JS: raw filtered scanlines + zlib stored blocks +
 * CRC32/Adler32, so it works anywhere Node runs.
 */
function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] as number;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const len = data.length;
  const out = new Uint8Array(8 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}
function makePng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // 10,11,12 = compression/filter/interlace = 0
  // Raw image: each row starts with a filter byte (0) then width*3 colour bytes.
  const stride = 1 + width * 3;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }
  const idat = deflateSync(raw);
  return concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(idat)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const PHOTO_COLORS: [number, number, number][] = [
  [214, 158, 46],
  [56, 161, 105],
  [49, 130, 206],
  [197, 48, 48],
  [128, 90, 213],
  [221, 107, 32],
  [45, 55, 72],
  [49, 151, 149],
  [176, 58, 46],
  [113, 128, 150],
];

// ─── R2 config (from apps/api sources) ────────────────────────────────────────────
interface R2Cfg {
  accountId: string;
  bucket: string;
  client: AwsClient;
}
export function loadR2Config(): R2Cfg | null {
  try {
    const wrangler = readFileSync("../../apps/api/wrangler.jsonc", "utf8");
    const accountId = wrangler.match(/"R2_ACCOUNT_ID"\s*:\s*"([^"]+)"/)?.[1];
    const bucket = wrangler.match(/"R2_BUCKET"\s*:\s*"([^"]+)"/)?.[1];
    const devVars = readFileSync("../../apps/api/.dev.vars", "utf8");
    const env: Record<string, string> = {};
    for (const line of devVars.split(/\r?\n/)) {
      const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (mm?.[1] && mm[2] !== undefined) env[mm[1]] = mm[2].replace(/^["']|["']$/g, "");
    }
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
    return {
      accountId,
      bucket,
      client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    };
  } catch {
    return null;
  }
}
async function uploadPhoto(cfg: R2Cfg, key: string, bytes: Uint8Array): Promise<boolean> {
  const path = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${path}`;
  const res = await cfg.client.fetch(url, {
    method: "PUT",
    body: bytes,
    headers: { "content-type": "image/png" },
  });
  return res.ok;
}

// ─── wipe the target site's business data (children before parents) ───────────────
async function wipeSite(db: ReturnType<typeof createDb>, siteId: string): Promise<void> {
  // Leaf/child tables first so FK constraints are satisfied, masters last.
  await db.delete(dprPhotos).where(eq(dprPhotos.siteId, siteId));
  await db.delete(dpr).where(eq(dpr.siteId, siteId));
  await db.delete(attendance).where(eq(attendance.siteId, siteId));
  await db.delete(workerAdvances).where(eq(workerAdvances.siteId, siteId));
  await db.delete(salaryPayments).where(eq(salaryPayments.siteId, siteId));
  await db.delete(stockMovements).where(eq(stockMovements.siteId, siteId));
  await db.delete(siteSales).where(eq(siteSales.siteId, siteId));
  await db.delete(invoiceItems).where(eq(invoiceItems.siteId, siteId));
  await db.delete(invoices).where(eq(invoices.siteId, siteId));
  await db.delete(purchaseItems).where(eq(purchaseItems.siteId, siteId));
  await db.delete(purchases).where(eq(purchases.siteId, siteId));
  await db.delete(expenses).where(eq(expenses.siteId, siteId));
  await db.delete(workers).where(eq(workers.siteId, siteId));
  await db.delete(workerCategories).where(eq(workerCategories.siteId, siteId));
  await db.delete(materials).where(eq(materials.siteId, siteId));
  await db.delete(suppliers).where(eq(suppliers.siteId, siteId));
}

/**
 * Seed 30 days of demo data into a specific site. Called by both the standalone
 * `seed:demo` command (targets the main owner's Vesu site) and `provision-demo.ts`
 * (targets a freshly created demo owner's site).
 */
export async function seedSite(
  db: ReturnType<typeof createDb>,
  site: {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    legalName: string | null;
    gstin: string | null;
    stateCode: string | null;
  },
  ownerId: string,
  r2: R2Cfg | null,
): Promise<void> {
  const siteId = site.id;

  console.log(
    `Seeding last ${WINDOW_DAYS} days of demo data into site "${site.name}" (${siteId})…`,
  );
  console.log(
    r2
      ? "  R2 configured — DPR photos will be uploaded."
      : "  ⚠ R2 not configured — DPR photo bytes will be skipped.",
  );

  console.log("  Wiping existing business data for this site…");
  await wipeSite(db, siteId);

  // ── Worker categories ──
  const catRows = await db
    .insert(workerCategories)
    .values(CATEGORIES.map((name) => ({ siteId, name })))
    .returning({ id: workerCategories.id });
  const catIds = catRows.map((c) => c.id);

  // ── Workers (45) ──
  const workerValues = Array.from({ length: 45 }, () => {
    const wage = rint(8, 18) * 50; // 400–900
    return {
      siteId,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `9${rint(100000000, 999999999)}`,
      categoryId: pick(catIds),
      dailyWage: m2(wage),
      overtimeRate: chance(0.7) ? m2(rint(50, 130)) : null,
    };
  });
  const workerRows = await db.insert(workers).values(workerValues).returning({ id: workers.id });
  const workerIds = workerRows.map((w) => w.id);

  // ── Materials (22) + stock-movement ledger (opening stock within the window) ──
  const materialValues = MATERIALS.map((mat) => {
    const stock = rint(20, 600);
    return {
      siteId,
      name: mat.name,
      sku:
        mat.name
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 8)
          .toUpperCase() + rint(10, 99),
      category: mat.cat,
      unit: mat.unit,
      currentStock: q3(stock),
      reorderLevel: q3(rint(10, 50)),
      unitCost: m2(mat.cost),
      _stock: stock,
      _cost: mat.cost,
    };
  });
  const materialRows = await db
    .insert(materials)
    .values(materialValues.map(({ _stock, _cost, ...m }) => m))
    .returning({ id: materials.id, unit: materials.unit, name: materials.name });

  const movementValues: (typeof stockMovements.$inferInsert)[] = [];
  materialRows.forEach((mr, i) => {
    const plan = materialValues[i];
    if (!plan) return;
    const stock = plan._stock;
    const extra = rint(0, Math.floor(stock / 3));
    movementValues.push({
      siteId,
      materialId: mr.id,
      type: "inward",
      quantity: q3(stock + extra),
      balanceAfter: q3(stock + extra),
      unitCost: m2(plan._cost),
      reference: "Opening stock",
      movementDate: daysAgo(rint(25, WINDOW_DAYS - 1)),
      createdByUserId: ownerId,
    });
    if (extra > 0) {
      movementValues.push({
        siteId,
        materialId: mr.id,
        type: "outward",
        quantity: q3(extra),
        balanceAfter: q3(stock),
        reference: "Site consumption",
        movementDate: daysAgo(rint(1, 24)),
        createdByUserId: ownerId,
      });
    }
  });
  await insertChunked(db, stockMovements, movementValues);

  // ── Suppliers (10) ──
  const supplierRows = await db
    .insert(suppliers)
    .values(
      SUPPLIERS.map((name) => ({
        siteId,
        name,
        contactPerson: `${pick(FIRST)} ${pick(LAST)}`,
        phone: `9${rint(100000000, 999999999)}`,
        gstin: `24${pick(["AAA", "ABB", "ACX", "BPQ"])}${rint(1000, 9999)}Z${rint(1, 9)}`,
        address: `${rint(1, 200)}, ${pick(DPR_LOC)}, ${site.city ?? "Surat"}`,
      })),
    )
    .returning({ id: suppliers.id, name: suppliers.name });

  // ── Purchases (26) + items (ordered within the window) ──
  interface PoPlan {
    po: typeof purchases.$inferInsert;
    items: Omit<typeof purchaseItems.$inferInsert, "purchaseId">[];
  }
  const poPlans: PoPlan[] = [];
  for (let i = 0; i < 26; i++) {
    const supplier = pick(supplierRows);
    const lineCount = rint(1, 3);
    const items: Omit<typeof purchaseItems.$inferInsert, "purchaseId">[] = [];
    let subtotal = 0;
    for (let j = 0; j < lineCount; j++) {
      const mr = pick(materialRows);
      const plan = materialValues.find((mv) => mv.name === mr.name);
      const qty = rint(5, 150);
      const rate = plan ? plan._cost * (0.95 + Math.random() * 0.15) : rint(20, 500);
      const amount = qty * rate;
      subtotal += amount;
      items.push({
        siteId,
        materialId: mr.id,
        description: mr.name,
        quantity: q3(qty),
        unit: mr.unit,
        rate: m2(rate),
        amount: m2(amount),
        receivedQty: q3(qty),
      });
    }
    const tax = chance(0.5) ? subtotal * 0.18 : 0;
    const total = subtotal + tax;
    const payRoll = Math.random();
    const amountPaid =
      payRoll < 0.45 ? total : payRoll < 0.75 ? total * (0.3 + Math.random() * 0.4) : 0;
    const paymentStatus = amountPaid <= 0 ? "unpaid" : amountPaid >= total ? "paid" : "partial";
    poPlans.push({
      po: {
        siteId,
        supplierId: supplier.id,
        sellerName: supplier.name,
        poNumber: `PO-${curMonth.replace("-", "")}-${String(i + 1).padStart(3, "0")}`,
        // Force the first few onto today so the "Today's Purchases" dashboard KPI has a
        // real sum to show; the rest spread across the window.
        orderDate: i < 4 ? daysAgo(0) : daysAgo(rint(1, WINDOW_DAYS - 1)),
        status: "received",
        total: m2(total),
        taxAmount: m2(tax),
        amountPaid: m2(amountPaid),
        paymentStatus,
        paymentMode: pick(PAY_MODES),
        createdByUserId: ownerId,
      },
      items,
    });
  }
  const poRows = await db
    .insert(purchases)
    .values(poPlans.map((p) => p.po))
    .returning({ id: purchases.id, poNumber: purchases.poNumber });
  const poIdByNumber = new Map(poRows.map((p) => [p.poNumber, p.id]));
  const poItemValues: (typeof purchaseItems.$inferInsert)[] = [];
  for (const plan of poPlans) {
    const id = poIdByNumber.get(plan.po.poNumber as string);
    if (!id) continue;
    for (const it of plan.items) poItemValues.push({ ...it, purchaseId: id });
  }
  await insertChunked(db, purchaseItems, poItemValues);

  // ── Expenses (110, within the window) ──
  const expenseValues = Array.from({ length: 110 }, () => {
    const roll = Math.random();
    const status = roll < 0.7 ? "approved" : roll < 0.9 ? "pending" : "rejected";
    const approved = status === "approved";
    return {
      siteId,
      expenseDate: daysAgo(rint(0, WINDOW_DAYS - 1)),
      category: pick(EXP_CATEGORIES),
      amount: m2(rint(2, 240) * 50),
      description: pick([
        "Site cleaning",
        "Tea & snacks",
        "Diesel for mixer",
        "Tempo hire",
        "Scaffolding rent",
        "Water tanker",
        "Tool purchase",
        "Mobile recharge",
        "Security wages",
        "Misc material",
      ]),
      paidTo: chance(0.6) ? `${pick(FIRST)} ${pick(LAST)}` : pick(SUPPLIERS),
      paymentMode: pick(PAY_MODES),
      isPettyCash: chance(0.4),
      status,
      approvedByUserId: approved ? ownerId : null,
      approvedAt: approved ? now : null,
      createdByUserId: ownerId,
    };
  });
  await insertChunked(db, expenses, expenseValues);

  // ── DPR (one per working day) + photos ──
  const dprValues = workingDays.map((reportDate, i) => {
    const work = pick(DPR_WORK);
    const locked = i < workingDays.length - 4 && chance(0.6); // older ones tend to be locked
    return {
      siteId,
      reportDate,
      workCategory: work,
      location: pick(DPR_LOC),
      completedWork: `${work} completed at ${pick(DPR_LOC)}. ${rint(40, 100)}% of planned scope done.`,
      pendingWork: `${pick(DPR_WORK)} pending for tomorrow.`,
      quantityValue: m2(rint(10, 500)),
      quantityUnit: pick(["sq ft", "cu m", "nos", "running ft", "bags"]),
      remarks: pick([
        "Good progress.",
        "Material shortage in the morning.",
        "Weather slowed work.",
        "On schedule.",
        "Extra labour deployed.",
      ]),
      status: locked ? "approved" : "submitted",
      approvedByUserId: locked ? ownerId : null,
      approvedAt: locked ? now : null,
      createdByUserId: ownerId,
    };
  });
  const dprRows = await db
    .insert(dpr)
    .values(dprValues)
    .returning({ id: dpr.id, reportDate: dpr.reportDate, workCategory: dpr.workCategory });

  // Photos: 1–3 per DPR, uploaded to R2 at the app's expected key.
  let photosUploaded = 0;
  let photosSkipped = 0;
  const photoMetaValues: (typeof dprPhotos.$inferInsert)[] = [];
  for (const d of dprRows) {
    const count = rint(1, 3);
    for (let p = 0; p < count; p++) {
      const color = pick(PHOTO_COLORS);
      const objectKey = `dpr/${siteId}/${d.id}/${crypto.randomUUID()}.png`;
      let ok = false;
      let bytesLen = 0;
      if (r2) {
        const png = makePng(320, 240, color);
        bytesLen = png.length;
        try {
          ok = await uploadPhoto(r2, objectKey, png);
        } catch {
          ok = false;
        }
      }
      if (ok) photosUploaded++;
      else photosSkipped++;
      // Store metadata regardless — if the byte upload failed the row still shows in the
      // gallery (the app signs a GET URL that 404s until re-uploaded).
      photoMetaValues.push({
        dprId: d.id,
        siteId,
        objectKey,
        fileName: `${(d.workCategory ?? "site").toLowerCase().replace(/\s+/g, "-")}-${d.reportDate}-${p + 1}.png`,
        contentType: "image/png",
        sizeBytes: bytesLen || null,
        uploadedByUserId: ownerId,
      });
    }
  }
  await insertChunked(db, dprPhotos, photoMetaValues);

  // ── Site sales (50, within the window) — each linked to an inventory material ──
  const saleValues = Array.from({ length: 50 }, (_, i) => {
    const mr = pick(materialRows);
    const plan = materialValues.find((mv) => mv.name === mr.name);
    const qty = rint(1, 40);
    const rate = plan ? plan._cost * (0.4 + Math.random() * 0.6) : rint(10, 200);
    const total = qty * rate;
    const roll = Math.random();
    const status = roll < 0.55 ? "paid" : roll < 0.85 ? "partial" : "unpaid";
    const received =
      status === "paid" ? total : status === "partial" ? total * (0.3 + Math.random() * 0.4) : 0;
    return {
      siteId,
      // Force the first few onto today so the "Today's Sales" dashboard KPI has a real
      // sum to show; the rest spread across the window.
      saleDate: i < 5 ? daysAgo(0) : daysAgo(rint(1, WINDOW_DAYS - 1)),
      itemDescription: mr.name,
      materialId: mr.id,
      quantity: q3(qty),
      unit: mr.unit,
      ratePerUnit: m2(rate),
      totalAmount: m2(total),
      buyerName: pick(BUYERS),
      buyerContact: `9${rint(100000000, 999999999)}`,
      paymentMode: pick(PAY_MODES),
      paymentStatus: status,
      amountReceived: m2(received),
      status: "confirmed",
      createdByUserId: ownerId,
    };
  });
  await insertChunked(db, siteSales, saleValues);

  // ── Invoices (14: mix of GST tax invoices + non-GST bills, within the window) ──
  const invoiceCount = 14;
  const invPlans: {
    inv: typeof invoices.$inferInsert;
    items: Omit<typeof invoiceItems.$inferInsert, "invoiceId">[];
  }[] = [];
  let taxSeq = 0;
  let billSeq = 0;
  for (let i = 0; i < invoiceCount; i++) {
    const client = pick(CLIENTS);
    const isTax = client.gstin && chance(0.75); // most GST clients get tax invoices
    const type = isTax ? "tax" : "bill";
    const seq = isTax ? ++taxSeq : ++billSeq;
    const supplyType = client.stateCode === (site.stateCode ?? "24") ? "intra" : "inter";
    const lineCount = rint(1, 4);
    const items: Omit<typeof invoiceItems.$inferInsert, "invoiceId">[] = [];
    let subTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    for (let j = 0; j < lineCount; j++) {
      const mr = pick(materialRows);
      const plan = materialValues.find((mv) => mv.name === mr.name);
      const qty = rint(1, 60);
      const rate = plan ? plan._cost * (1.1 + Math.random() * 0.4) : rint(50, 800);
      const gross = qty * rate;
      const discount = chance(0.25) ? gross * (0.02 + Math.random() * 0.05) : 0;
      const taxable = gross - discount;
      const gstRate = isTax ? pick([5, 12, 18, 18, 18]) : 0;
      const taxAmt = taxable * (gstRate / 100);
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      if (isTax) {
        if (supplyType === "intra") {
          cgst = taxAmt / 2;
          sgst = taxAmt / 2;
        } else {
          igst = taxAmt;
        }
      }
      subTotal += taxable;
      cgstTotal += cgst;
      sgstTotal += sgst;
      igstTotal += igst;
      items.push({
        siteId,
        materialId: mr.id,
        description: mr.name,
        hsnCode: plan ? (HSN_BY_CAT[plan.category] ?? null) : null,
        quantity: q3(qty),
        unit: mr.unit,
        rate: m2(rate),
        discountAmount: m2(discount),
        taxableValue: m2(taxable),
        gstRate: m2(gstRate),
        cgstAmount: m2(cgst),
        sgstAmount: m2(sgst),
        igstAmount: m2(igst),
        taxAmount: m2(taxAmt),
        lineTotal: m2(taxable + taxAmt),
        sortOrder: j,
      });
    }
    const taxTotal = cgstTotal + sgstTotal + igstTotal;
    const preRound = subTotal + taxTotal;
    const grand = Math.round(preRound);
    const roundOff = grand - preRound;
    const payRoll = Math.random();
    const amountReceived =
      payRoll < 0.5 ? grand : payRoll < 0.8 ? Math.round(grand * (0.3 + Math.random() * 0.4)) : 0;
    const paymentStatus =
      amountReceived <= 0 ? "unpaid" : amountReceived >= grand ? "paid" : "partial";
    const invDate = daysAgo(rint(0, WINDOW_DAYS - 1));
    const prefix = site.code ?? "INV";
    invPlans.push({
      inv: {
        siteId,
        invoiceType: type,
        invoiceNumber: `${prefix}/${type === "tax" ? "T" : "B"}/${financialYear.replace("-", "")}/${String(seq).padStart(4, "0")}`,
        invoiceSeq: seq,
        financialYear,
        invoiceDate: invDate,
        dueDate: daysAgoFrom(invDate, -15),
        supplyType,
        placeOfSupply: `${client.stateCode}-${client.state}`,
        sellerName: site.legalName ?? site.name,
        sellerGstin: site.gstin ?? "24ABCDE1234F1Z5",
        sellerAddress: `${site.address ?? "Plot 21, Industrial Estate"}, ${site.city ?? "Surat"}`,
        sellerState: site.state ?? "Gujarat",
        sellerStateCode: site.stateCode ?? "24",
        buyerName: client.name,
        buyerGstin: client.gstin
          ? `${client.stateCode}AABCP${rint(1000, 9999)}Q1Z${rint(1, 9)}`
          : null,
        buyerState: client.state,
        buyerStateCode: client.stateCode,
        subTotal: m2(subTotal),
        discountTotal: m2(0),
        cgstTotal: m2(cgstTotal),
        sgstTotal: m2(sgstTotal),
        igstTotal: m2(igstTotal),
        taxTotal: m2(taxTotal),
        roundOff: m2(roundOff),
        grandTotal: m2(grand),
        amountInWords: `Rupees ${grand} only`,
        paymentStatus,
        amountReceived: m2(amountReceived),
        paymentMode: pick(PAY_MODES),
        status: "issued",
        createdByUserId: ownerId,
      },
      items,
    });
  }
  const invRows = await db
    .insert(invoices)
    .values(invPlans.map((p) => p.inv))
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });
  const invIdByNumber = new Map(invRows.map((r) => [r.invoiceNumber, r.id]));
  const invItemValues: (typeof invoiceItems.$inferInsert)[] = [];
  for (const plan of invPlans) {
    const id = invIdByNumber.get(plan.inv.invoiceNumber as string);
    if (!id) continue;
    for (const it of plan.items) invItemValues.push({ ...it, invoiceId: id });
  }
  await insertChunked(db, invoiceItems, invItemValues);

  // ── Attendance (working days × workers) ──
  const attValues: (typeof attendance.$inferInsert)[] = [];
  for (const date of workingDays) {
    for (const wid of workerIds) {
      const roll = Math.random();
      const status = roll < 0.82 ? "present" : roll < 0.92 ? "half_day" : "absent";
      const approved = chance(0.7);
      attValues.push({
        siteId,
        workerId: wid,
        attendanceDate: date,
        status,
        overtimeHours: status !== "absent" && chance(0.2) ? m2(rint(1, 3)) : m2(0),
        approved,
        approvedByUserId: approved ? ownerId : null,
        approvedAt: approved ? now : null,
        markedByUserId: ownerId,
      });
    }
  }
  await insertChunked(db, attendance, attValues, 300);

  // ── Worker advances (18, this window) ──
  const advanceValues = Array.from({ length: 18 }, () => ({
    siteId,
    workerId: pick(workerIds),
    amount: m2(rint(10, 60) * 100),
    advanceDate: pick(workingDays),
    note: pick(["Festival advance", "Medical", "Family need", "Requested", "Travel"]),
    createdByUserId: ownerId,
  }));
  await insertChunked(db, workerAdvances, advanceValues);

  // ── Salary payments (18, this month) ──
  const paymentValues = Array.from({ length: 18 }, () => ({
    siteId,
    workerId: pick(workerIds),
    periodMonth: curMonth,
    amount: m2(rint(20, 90) * 100),
    paidDate: pick(workingDays),
    paymentMode: pick(PAY_MODES),
    createdByUserId: ownerId,
  }));
  await insertChunked(db, salaryPayments, paymentValues);

  console.log("Demo data seeded (last 30 days):");
  console.log(`  Site:        ${site.name}`);
  console.log(`  Categories:  ${catRows.length}`);
  console.log(`  Workers:     ${workerRows.length}`);
  console.log(`  Materials:   ${materialRows.length} (+${movementValues.length} stock movements)`);
  console.log(`  Suppliers:   ${supplierRows.length}`);
  console.log(`  Purchases:   ${poRows.length} (+${poItemValues.length} items)`);
  console.log(`  Expenses:    ${expenseValues.length}`);
  console.log(`  DPR:         ${dprRows.length} (+${photoMetaValues.length} photos)`);
  console.log(
    `  DPR photos:  ${photosUploaded} uploaded${photosSkipped ? `, ${photosSkipped} skipped` : ""}`,
  );
  console.log(`  Sales:       ${saleValues.length}`);
  console.log(`  Invoices:    ${invRows.length} (+${invItemValues.length} items)`);
  console.log(
    `  Attendance:  ${attValues.length} (${workingDays.length} days × ${workerIds.length})`,
  );
  console.log(`  Advances:    ${advanceValues.length}`);
  console.log(`  Salary pay:  ${paymentValues.length}`);
  console.log(`  -> Switch the site to "${site.name}" in the app to view it.`);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (packages/db/.env).");

  await configureNeonForNode();
  const db = createDb(databaseUrl);

  const [owner] = await db.select().from(users).where(eq(users.isOwner, true)).limit(1);
  if (!owner) throw new Error("No owner user found — run `pnpm db:seed` first.");

  const ownedSites = await db.select().from(sites).where(eq(sites.ownerUserId, owner.id));
  if (ownedSites.length === 0) throw new Error("Owner has no sites — run `pnpm db:seed` first.");
  const site = ownedSites.find((s) => s.name === "Vesu") ?? ownedSites[0];
  if (!site) throw new Error("No target site.");

  await seedSite(db, site, owner.id, loadR2Config());
}

/** Shift an ISO date by `n` days (negative = future). */
function daysAgoFrom(iso: string, n: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y as number, (mo as number) - 1, d as number);
  dt.setDate(dt.getDate() - n);
  return isoOf(dt);
}

async function insertChunked<T>(
  db: ReturnType<typeof createDb>,
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table type is awkward to thread through
  table: any,
  rows: T[],
  size = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    if (slice.length > 0) await db.insert(table).values(slice);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });
