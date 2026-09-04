import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  agentQuotes,
  auditEntries,
  buyerMandates,
  catalogProducts,
  checkoutOrders,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const MERCHANT_ID = "atlas-supply";
const DEMO_MANDATE_ID = "mnd_demo_safe_purchase";

export const demoCatalog = [
  {
    id: "prod_atlas_ops_pro",
    merchantId: MERCHANT_ID,
    sku: "OPS-PRO-2400",
    name: "Operations Pro Kit",
    description: "A fulfillment readiness bundle for growing storefront operations.",
    pricePaise: 240000,
    currency: "INR",
    stock: 4,
    gstBps: 1800,
    returnPolicy: "Eligible for return within 7 days when unused and in original packaging.",
    active: true,
  },
  {
    id: "prod_atlas_ops_core",
    merchantId: MERCHANT_ID,
    sku: "OPS-CORE-1850",
    name: "Operations Core Kit",
    description: "A lower-cost operational starter pack recommended when the mandate cap is exceeded.",
    pricePaise: 185000,
    currency: "INR",
    stock: 12,
    gstBps: 1800,
    returnPolicy: "Eligible for return within 7 days when unused and in original packaging.",
    active: true,
  },
  {
    id: "prod_atlas_ops_mini",
    merchantId: MERCHANT_ID,
    sku: "OPS-MINI-950",
    name: "Operations Mini Kit",
    description: "A compact replenishment pack for smaller purchasing mandates.",
    pricePaise: 95000,
    currency: "INR",
    stock: 0,
    gstBps: 1800,
    returnPolicy: "Eligible for return within 7 days when unused and in original packaging.",
    active: true,
  },
];

export function merchantId() {
  return MERCHANT_ID;
}

export async function ensureCommerceBootstrap() {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");

  const catalogExists = await db.select({ id: catalogProducts.id }).from(catalogProducts).limit(1);
  if (catalogExists.length === 0) {
    await db.insert(catalogProducts).values([...demoCatalog]);
  }

  const mandateExists = await db.select({ id: buyerMandates.id }).from(buyerMandates).where(eq(buyerMandates.id, DEMO_MANDATE_ID)).limit(1);
  if (mandateExists.length === 0) {
    await db.insert(buyerMandates).values({
      id: DEMO_MANDATE_ID,
      label: "Demo · Atlas purchasing mandate",
      merchantAllowlist: JSON.stringify([MERCHANT_ID]),
      spendCapPaise: 200000,
      spentPaise: 0,
      reservedPaise: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "active",
    });
  }
}

export async function getCommerceSnapshot() {
  await ensureCommerceBootstrap();
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  const [catalog, mandates, orders, audits] = await Promise.all([
    db.select().from(catalogProducts).orderBy(catalogProducts.pricePaise),
    db.select().from(buyerMandates).orderBy(desc(buyerMandates.createdAt)),
    db.select().from(checkoutOrders).orderBy(desc(checkoutOrders.createdAt)).limit(12),
    db.select().from(auditEntries).orderBy(desc(auditEntries.createdAt)).limit(28),
  ]);
  return { catalog, mandates, orders, audits };
}

export async function findMandate(id: string) {
  await ensureCommerceBootstrap();
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  return (await db.select().from(buyerMandates).where(eq(buyerMandates.id, id)).limit(1))[0] ?? null;
}

export async function findProduct(sku: string) {
  await ensureCommerceBootstrap();
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  return (await db.select().from(catalogProducts).where(eq(catalogProducts.sku, sku)).limit(1))[0] ?? null;
}

export async function findQuote(id: string) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  return (await db.select().from(agentQuotes).where(eq(agentQuotes.id, id)).limit(1))[0] ?? null;
}

export async function findOrder(id: string) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  return (await db.select().from(checkoutOrders).where(eq(checkoutOrders.id, id)).limit(1))[0] ?? null;
}

export async function createMandate(input: { label: string; merchantAllowlist: string[]; spendCapPaise: number; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  const id = `mnd_${nanoid(12)}`;
  await db.insert(buyerMandates).values({
    id,
    label: input.label,
    merchantAllowlist: JSON.stringify(input.merchantAllowlist),
    spendCapPaise: input.spendCapPaise,
    spentPaise: 0,
    reservedPaise: 0,
    expiresAt: input.expiresAt,
    status: "active",
  });
  return findMandate(id);
}

export async function saveQuote(input: {
  mandateId: string;
  merchantId: string;
  sku: string;
  amountPaise: number;
  status: "allowed" | "refused";
  policySnapshot: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  const id = `qte_${nanoid(12)}`;
  await db.insert(agentQuotes).values({ id, ...input });
  return { id, ...input };
}

export async function saveOrder(input: {
  mandateId: string;
  quoteId: string;
  merchantId: string;
  sku: string;
  amountPaise: number;
  provider: "demo" | "razorpay";
  providerOrderId: string;
  status: "created" | "payment_pending";
  policySnapshot: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  const id = `ord_${nanoid(12)}`;
  await db.insert(checkoutOrders).values({ id, currency: "INR", ...input });
  return findOrder(id);
}

export async function reserveMandateSpend(mandateId: string, amountPaise: number) {
  const mandate = await findMandate(mandateId);
  const db = await getDb();
  if (!mandate || !db) throw new Error("Cannot reserve against an unavailable mandate.");
  await db.update(buyerMandates).set({ reservedPaise: mandate.reservedPaise + amountPaise }).where(eq(buyerMandates.id, mandateId));
}

export async function settleOrder(orderId: string, paymentId: string | null, status: "paid" | "payment_pending" = "paid") {
  const order = await findOrder(orderId);
  const db = await getDb();
  if (!order || !db) throw new Error("Cannot settle an unavailable order.");
  await db.update(checkoutOrders).set({ status, providerPaymentId: paymentId }).where(eq(checkoutOrders.id, orderId));
  if (status === "paid") {
    const mandate = await findMandate(order.mandateId);
    if (!mandate) throw new Error("Cannot settle against an unavailable mandate.");
    await db.update(buyerMandates).set({
      reservedPaise: Math.max(0, mandate.reservedPaise - order.amountPaise),
      spentPaise: mandate.spentPaise + order.amountPaise,
    }).where(eq(buyerMandates.id, mandate.id));
  }
  return findOrder(orderId);
}

export async function appendAudit(input: {
  mandateId?: string | null;
  orderId?: string | null;
  action: string;
  selectedSku?: string | null;
  amountPaise?: number | null;
  rationale: string;
  policyResult: "allowed" | "refused" | "observed";
  outcome: string;
  details: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The commerce demo database is unavailable.");
  await db.insert(auditEntries).values({ id: `aud_${nanoid(12)}`, ...input });
}
