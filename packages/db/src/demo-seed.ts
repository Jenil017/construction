import { and, eq, isNull } from "drizzle-orm";
import { configureNeonForNode, createDb } from "./client";
import {
  attendance,
  dpr,
  expenses,
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
 * volumes. Additive and guarded — if the target site already has many workers it
 * exits without duplicating. Run with `pnpm --filter @construction-erp/db seed:demo`
 * (needs packages/db/.env DATABASE_URL). Safe to delete; never used in production.
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

// Working days of the current month up to today (Sundays off).
const monthDays: string[] = [];
for (let day = 1; day <= now.getDate(); day++) {
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d.getDay() === 0) continue;
  monthDays.push(isoOf(d));
}

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

  // Owner + a target site.
  const [owner] = await db.select().from(users).where(eq(users.isOwner, true)).limit(1);
  if (!owner) throw new Error("No owner user found — run `pnpm db:seed` first.");
  const ownerId = owner.id;

  const ownedSites = await db.select().from(sites).where(eq(sites.ownerUserId, ownerId));
  if (ownedSites.length === 0) throw new Error("Owner has no sites — run `pnpm db:seed` first.");
  // Prefer a site named "Vesu", else the first.
  const site = ownedSites.find((s) => s.name === "Vesu") ?? ownedSites[0];
  if (!site) throw new Error("No target site.");
  const siteId = site.id;

  // Guard against double-seeding.
  const existingWorkers = await db
    .select({ id: workers.id })
    .from(workers)
    .where(and(eq(workers.siteId, siteId), isNull(workers.deletedAt)));
  if (existingWorkers.length >= 30) {
    console.log(
      `Site "${site.name}" already has ${existingWorkers.length} workers — looks seeded. Skipping.`,
    );
    return;
  }

  console.log(`Seeding demo data into site "${site.name}" (${siteId})…`);

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

  // ── Materials (22) + stock-movement ledger ──
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
      movementDate: daysAgo(rint(30, 60)),
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
        movementDate: daysAgo(rint(1, 25)),
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

  // ── Purchases (26) + items ──
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
        orderDate: daysAgo(rint(1, 60)),
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

  // ── Expenses (130) ──
  const expenseValues = Array.from({ length: 130 }, () => {
    const roll = Math.random();
    const status = roll < 0.7 ? "approved" : roll < 0.9 ? "pending" : "rejected";
    const approved = status === "approved";
    return {
      siteId,
      expenseDate: daysAgo(rint(0, 60)),
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

  // ── DPR (18 days) ──
  const dprValues = Array.from({ length: 18 }, (_, i) => {
    const work = pick(DPR_WORK);
    const roll = Math.random();
    return {
      siteId,
      reportDate: daysAgo(i),
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
      // Locked (approved) vs still-open (submitted) — there is no draft stage.
      status: roll < 0.5 ? "approved" : "submitted",
      approvedByUserId: roll < 0.5 ? ownerId : null,
      approvedAt: roll < 0.5 ? now : null,
      createdByUserId: ownerId,
    };
  });
  await insertChunked(db, dpr, dprValues);

  // ── Site sales (55) — each linked to an inventory material ──
  const saleValues = Array.from({ length: 55 }, () => {
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
      saleDate: daysAgo(rint(0, 60)),
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

  // ── Attendance (current month working days × workers) ──
  const attValues: (typeof attendance.$inferInsert)[] = [];
  for (const date of monthDays) {
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

  // ── Worker advances (20, this month) ──
  const advanceValues = Array.from({ length: 20 }, () => ({
    siteId,
    workerId: pick(workerIds),
    amount: m2(rint(10, 60) * 100),
    advanceDate: pick(monthDays),
    note: pick(["Festival advance", "Medical", "Family need", "Requested", "Travel"]),
    createdByUserId: ownerId,
  }));
  await insertChunked(db, workerAdvances, advanceValues);

  // ── Salary payments (20, this month) ──
  const paymentValues = Array.from({ length: 20 }, () => ({
    siteId,
    workerId: pick(workerIds),
    periodMonth: curMonth,
    amount: m2(rint(20, 90) * 100),
    paidDate: pick(monthDays),
    paymentMode: pick(PAY_MODES),
    createdByUserId: ownerId,
  }));
  await insertChunked(db, salaryPayments, paymentValues);

  console.log("Demo data seeded:");
  console.log(`  Site:        ${site.name}`);
  console.log(`  Categories:  ${catRows.length}`);
  console.log(`  Workers:     ${workerRows.length}`);
  console.log(`  Materials:   ${materialRows.length} (+${movementValues.length} stock movements)`);
  console.log(`  Suppliers:   ${supplierRows.length}`);
  console.log(`  Purchases:   ${poRows.length} (+${poItemValues.length} items)`);
  console.log(`  Expenses:    ${expenseValues.length}`);
  console.log(`  DPR:         ${dprValues.length}`);
  console.log(`  Sales:       ${saleValues.length}`);
  console.log(
    `  Attendance:  ${attValues.length} (${monthDays.length} days × ${workerIds.length})`,
  );
  console.log(`  Advances:    ${advanceValues.length}`);
  console.log(`  Salary pay:  ${paymentValues.length}`);
  console.log(`  -> Switch the site to "${site.name}" in the app to view it.`);
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
