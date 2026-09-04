import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core identity table provided by the template. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const catalogProducts = mysqlTable("catalogProducts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  merchantId: varchar("merchantId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  pricePaise: int("pricePaise").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  stock: int("stock").notNull(),
  gstBps: int("gstBps").notNull(),
  returnPolicy: text("returnPolicy").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const buyerMandates = mysqlTable("buyerMandates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  merchantAllowlist: text("merchantAllowlist").notNull(),
  spendCapPaise: int("spendCapPaise").notNull(),
  spentPaise: int("spentPaise").notNull().default(0),
  reservedPaise: int("reservedPaise").notNull().default(0),
  expiresAt: timestamp("expiresAt").notNull(),
  status: mysqlEnum("status", ["active", "expired", "suspended"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const agentQuotes = mysqlTable("agentQuotes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  mandateId: varchar("mandateId", { length: 64 }).notNull(),
  merchantId: varchar("merchantId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull(),
  amountPaise: int("amountPaise").notNull(),
  status: mysqlEnum("status", ["allowed", "refused"]).notNull(),
  policySnapshot: text("policySnapshot").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const checkoutOrders = mysqlTable("checkoutOrders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  mandateId: varchar("mandateId", { length: 64 }).notNull(),
  quoteId: varchar("quoteId", { length: 64 }).notNull(),
  merchantId: varchar("merchantId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull(),
  amountPaise: int("amountPaise").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  provider: mysqlEnum("provider", ["demo", "razorpay"]).notNull().default("demo"),
  providerOrderId: varchar("providerOrderId", { length: 128 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 128 }),
  status: mysqlEnum("status", ["created", "payment_pending", "paid", "failed", "refused"])
    .notNull()
    .default("created"),
  policySnapshot: text("policySnapshot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditEntries = mysqlTable("auditEntries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  mandateId: varchar("mandateId", { length: 64 }),
  orderId: varchar("orderId", { length: 64 }),
  action: varchar("action", { length: 64 }).notNull(),
  selectedSku: varchar("selectedSku", { length: 64 }),
  amountPaise: int("amountPaise"),
  rationale: text("rationale").notNull(),
  policyResult: mysqlEnum("policyResult", ["allowed", "refused", "observed"]).notNull(),
  outcome: varchar("outcome", { length: 64 }).notNull(),
  details: text("details").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CatalogProduct = typeof catalogProducts.$inferSelect;
export type BuyerMandate = typeof buyerMandates.$inferSelect;
export type AgentQuote = typeof agentQuotes.$inferSelect;
export type CheckoutOrder = typeof checkoutOrders.$inferSelect;
export type AuditEntry = typeof auditEntries.$inferSelect;
