import { afterEach, describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy";
import { createProviderOrder, resolveProviderPayment } from "./razorpay";

const now = new Date("2026-08-22T10:00:00.000Z");
const mandate = {
  id: "mnd_test",
  merchantAllowlist: ["atlas-supply"],
  spendCapPaise: 200000,
  spentPaise: 0,
  reservedPaise: 0,
  expiresAt: new Date("2026-08-23T10:00:00.000Z"),
  status: "active" as const,
};
const highValueProduct = {
  merchantId: "atlas-supply",
  sku: "OPS-PRO-2400",
  pricePaise: 240000,
  stock: 4,
  active: true,
};
const eligibleProduct = {
  merchantId: "atlas-supply",
  sku: "OPS-CORE-1850",
  pricePaise: 185000,
  stock: 4,
  active: true,
};

describe("commerce policy gate", () => {
  it("refuses an over-cap quote and preserves the remaining mandate balance", () => {
    const result = evaluatePolicy({ action: "quote", mandate, product: highValueProduct, now });
    expect(result).toMatchObject({ result: "refused", code: "SPEND_CAP_EXCEEDED", remainingSpendPaise: 200000 });
    expect(result.checks.find(check => check.key === "spend-cap")).toMatchObject({ result: "fail" });
  });

  it("allows a lower-cost in-stock SKU but refuses order creation without a matching quote", () => {
    const quote = evaluatePolicy({ action: "quote", mandate, product: eligibleProduct, now });
    expect(quote.result).toBe("allowed");

    const order = evaluatePolicy({ action: "create_order", mandate, product: eligibleProduct, now });
    expect(order).toMatchObject({ result: "refused", code: "QUOTE_INVALID" });
  });

  it("permits payment confirmation only for a created policy-approved order", () => {
    const result = evaluatePolicy({
      action: "confirm_payment",
      mandate,
      order: { mandateId: mandate.id, sku: eligibleProduct.sku, amountPaise: eligibleProduct.pricePaise, status: "created" },
      now,
    });
    expect(result).toMatchObject({ result: "allowed", code: "PAYMENT_CONFIRMATION_ALLOWED" });
  });

  it("refuses a merchant outside the allowlist, an expired mandate, an unavailable SKU, and an unsupported tool", () => {
    const wrongMerchant = evaluatePolicy({ action: "quote", mandate, product: { ...eligibleProduct, merchantId: "other-merchant" }, now });
    expect(wrongMerchant).toMatchObject({ result: "refused", code: "MERCHANT_NOT_ALLOWED" });

    const expired = evaluatePolicy({ action: "quote", mandate: { ...mandate, expiresAt: new Date("2026-08-22T09:59:59.000Z") }, product: eligibleProduct, now });
    expect(expired).toMatchObject({ result: "refused", code: "MANDATE_EXPIRED" });

    const unavailable = evaluatePolicy({ action: "quote", mandate, product: { ...eligibleProduct, stock: 0 }, now });
    expect(unavailable).toMatchObject({ result: "refused", code: "STOCK_UNAVAILABLE" });

    const unsupported = evaluatePolicy({ action: "charge_card" as any, mandate, now });
    expect(unsupported).toMatchObject({ result: "refused", code: "TOOL_NOT_ALLOWED" });
  });

  it("allows create_order only when the current quote matches the mandate, merchant, SKU, and price", () => {
    const result = evaluatePolicy({
      action: "create_order",
      mandate,
      product: eligibleProduct,
      quote: {
        mandateId: mandate.id,
        merchantId: eligibleProduct.merchantId,
        sku: eligibleProduct.sku,
        amountPaise: eligibleProduct.pricePaise,
        status: "allowed",
        expiresAt: new Date("2026-08-22T10:10:00.000Z"),
      },
      now,
    });
    expect(result).toMatchObject({ result: "allowed", code: "ORDER_CREATION_ALLOWED" });
  });

  it("refuses payment confirmation for an already settled order", () => {
    const result = evaluatePolicy({
      action: "confirm_payment",
      mandate,
      order: { mandateId: mandate.id, sku: eligibleProduct.sku, amountPaise: eligibleProduct.pricePaise, status: "paid" },
      now,
    });
    expect(result).toMatchObject({ result: "refused", code: "ORDER_NOT_CONFIRMABLE" });
  });
});

describe("Razorpay server adapter", () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;

  afterEach(() => {
    if (previousKeyId) process.env.RAZORPAY_KEY_ID = previousKeyId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (previousKeySecret) process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("uses explicit demo references when Razorpay test credentials are not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const order = await createProviderOrder({ amountPaise: 185000, receipt: "receipt_test", notes: { mandate_id: "mnd_test" } });
    expect(order.provider).toBe("demo");
    expect(order.providerOrderId).toMatch(/^order_demo_/);

    const payment = await resolveProviderPayment(order);
    expect(payment).toMatchObject({ status: "paid" });
    expect(payment.providerPaymentId).toMatch(/^pay_demo_/);
  });
});
