import { nanoid } from "nanoid";
import {
  appendAudit,
  createMandate,
  findMandate,
  findOrder,
  findProduct,
  findQuote,
  getCommerceSnapshot,
  merchantId,
  reserveMandateSpend,
  saveOrder,
  saveQuote,
  settleOrder,
} from "../db";
import { evaluatePolicy } from "./policy";
import { createProviderOrder, isRazorpayConfigured, resolveProviderPayment } from "./razorpay";
import { AGENT_TOOLS, formatINR, type AgentTool, type PolicyMandate } from "./types";

function asMandate(mandate: NonNullable<Awaited<ReturnType<typeof findMandate>>>): PolicyMandate {
  let merchantAllowlist: string[] = [];
  try {
    merchantAllowlist = JSON.parse(mandate.merchantAllowlist);
  } catch {
    merchantAllowlist = [];
  }
  return { ...mandate, merchantAllowlist };
}

function machineProduct(product: Awaited<ReturnType<typeof findProduct>>) {
  if (!product) return null;
  return {
    sku: product.sku,
    merchant_id: product.merchantId,
    title: product.name,
    description: product.description,
    price: { amount_paise: product.pricePaise, currency: product.currency, display: formatINR(product.pricePaise) },
    availability: { in_stock: product.active && product.stock > 0, quantity: product.stock },
    tax: { gst_bps: product.gstBps, gst_percent: product.gstBps / 100 },
    return_policy: product.returnPolicy,
  };
}

function auditDetails(decision: ReturnType<typeof evaluatePolicy>) {
  return JSON.stringify({ code: decision.code, checks: decision.checks, remainingSpendPaise: decision.remainingSpendPaise });
}

export async function getDashboard() {
  const snapshot = await getCommerceSnapshot();
  return {
    merchant: { id: merchantId(), name: "Atlas Supply Co.", settlementMode: "server-governed" },
    paymentMode: isRazorpayConfigured() ? "razorpay_test" : "safe_demo",
    supportedTools: AGENT_TOOLS,
    catalog: snapshot.catalog.map(machineProduct),
    mandates: snapshot.mandates.map(mandate => ({
      ...mandate,
      merchantAllowlist: JSON.parse(mandate.merchantAllowlist) as string[],
      remainingSpendPaise: Math.max(0, mandate.spendCapPaise - mandate.spentPaise - mandate.reservedPaise),
    })),
    orders: snapshot.orders,
    audits: snapshot.audits,
  };
}

export async function createBuyerMandate(input: { label: string; spendCapPaise: number; expiresInHours: number }) {
  const mandate = await createMandate({
    label: input.label,
    merchantAllowlist: [merchantId()],
    spendCapPaise: input.spendCapPaise,
    expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
  });
  if (!mandate) throw new Error("The buyer mandate could not be created.");
  await appendAudit({
    mandateId: mandate.id,
    action: "create_mandate",
    rationale: "A buyer configured a bounded spend authorization for the merchant allowlist.",
    policyResult: "observed",
    outcome: "mandate_created",
    details: JSON.stringify({ spendCapPaise: mandate.spendCapPaise, expiresAt: mandate.expiresAt, merchantAllowlist: [merchantId()] }),
  });
  return mandate;
}

export async function runGetCatalog() {
  const decision = evaluatePolicy({ action: "get_catalog" });
  const dashboard = await getDashboard();
  await appendAudit({
    action: "get_catalog",
    rationale: "Agent requested the merchant's machine-readable catalog before selecting a SKU.",
    policyResult: "allowed",
    outcome: "catalog_returned",
    details: auditDetails(decision),
  });
  return {
    schema: "mandate-checkout.catalog.v1",
    merchant: dashboard.merchant,
    products: dashboard.catalog,
    policy: decision,
  };
}

export async function runQuote(input: { mandateId: string; sku: string; rationale: string }) {
  const [mandate, product] = await Promise.all([findMandate(input.mandateId), findProduct(input.sku)]);
  const decision = evaluatePolicy({ action: "quote", mandate: mandate ? asMandate(mandate) : null, product });
  const quote = await saveQuote({
    mandateId: input.mandateId,
    merchantId: product?.merchantId ?? merchantId(),
    sku: input.sku,
    amountPaise: product?.pricePaise ?? 0,
    status: decision.result,
    policySnapshot: auditDetails(decision),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const dashboard = await getDashboard();
  const recommendedProduct = decision.result === "refused"
    ? dashboard.catalog.find(product => Boolean(product && product.availability.in_stock && product.price.amount_paise <= decision.remainingSpendPaise))
    : null;

  await appendAudit({
    mandateId: input.mandateId,
    action: "quote",
    selectedSku: input.sku,
    amountPaise: product?.pricePaise ?? null,
    rationale: input.rationale,
    policyResult: decision.result,
    outcome: decision.result === "allowed" ? "quote_issued" : "quote_refused",
    details: JSON.stringify({ ...JSON.parse(auditDetails(decision)), quoteId: quote.id, recommendedSku: recommendedProduct?.sku ?? null }),
  });

  return {
    quoteId: quote.id,
    status: decision.result,
    quote: product ? { sku: product.sku, amountPaise: product.pricePaise, displayAmount: formatINR(product.pricePaise), expiresAt: quote.expiresAt } : null,
    policy: decision,
    recovery: recommendedProduct
      ? {
          message: `No order was created. ${recommendedProduct.sku} is available within the remaining mandate spend.`,
          product: recommendedProduct,
        }
      : null,
  };
}

export async function runCreateOrder(input: { mandateId: string; quoteId: string; rationale: string }) {
  const quote = await findQuote(input.quoteId);
  const [mandate, product] = await Promise.all([findMandate(input.mandateId), findProduct(quote?.sku ?? "")]);
  const decision = evaluatePolicy({
    action: "create_order",
    mandate: mandate ? asMandate(mandate) : null,
    product,
    quote: quote ?? null,
  });

  if (decision.result === "refused" || !quote || !product) {
    await appendAudit({
      mandateId: input.mandateId,
      action: "create_order",
      selectedSku: product?.sku ?? null,
      amountPaise: product?.pricePaise ?? null,
      rationale: input.rationale,
      policyResult: "refused",
      outcome: "order_not_created",
      details: auditDetails(decision),
    });
    return { status: "refused" as const, policy: decision, order: null };
  }

  const approvedProduct = product;
  const providerOrder = await createProviderOrder({
    amountPaise: approvedProduct.pricePaise,
    receipt: `mnd_${input.mandateId.slice(-10)}_${nanoid(6)}`,
    notes: { mandate_id: input.mandateId, quote_id: input.quoteId, sku: approvedProduct.sku },
  });
  const order = await saveOrder({
    mandateId: input.mandateId,
    quoteId: input.quoteId,
    merchantId: approvedProduct.merchantId,
    sku: approvedProduct.sku,
    amountPaise: approvedProduct.pricePaise,
    provider: providerOrder.provider,
    providerOrderId: providerOrder.providerOrderId,
    status: "created",
    policySnapshot: auditDetails(decision),
  });
  await reserveMandateSpend(input.mandateId, approvedProduct.pricePaise);
  await appendAudit({
    mandateId: input.mandateId,
    orderId: order?.id,
    action: "create_order",
    selectedSku: approvedProduct.sku,
    amountPaise: approvedProduct.pricePaise,
    rationale: input.rationale,
    policyResult: "allowed",
    outcome: "order_created",
    details: JSON.stringify({ ...JSON.parse(auditDetails(decision)), orderId: order?.id, providerOrderId: providerOrder.providerOrderId, provider: providerOrder.provider }),
  });
  return { status: "created" as const, policy: decision, order };
}

export async function runConfirmPayment(input: { orderId: string; rationale: string }) {
  const order = await findOrder(input.orderId);
  const mandate = order ? await findMandate(order.mandateId) : null;
  const decision = evaluatePolicy({ action: "confirm_payment", mandate: mandate ? asMandate(mandate) : null, order });
  if (decision.result === "refused" || !order) {
    await appendAudit({
      mandateId: mandate?.id,
      orderId: input.orderId,
      action: "confirm_payment",
      selectedSku: order?.sku,
      amountPaise: order?.amountPaise,
      rationale: input.rationale,
      policyResult: "refused",
      outcome: "payment_not_confirmed",
      details: auditDetails(decision),
    });
    return { status: "refused" as const, policy: decision, order: null };
  }

  const payment = await resolveProviderPayment({ provider: order.provider, providerOrderId: order.providerOrderId });
  const settledOrder = await settleOrder(order.id, payment.providerPaymentId, payment.status);
  await appendAudit({
    mandateId: mandate?.id,
    orderId: order.id,
    action: "confirm_payment",
    selectedSku: order.sku,
    amountPaise: order.amountPaise,
    rationale: input.rationale,
    policyResult: "allowed",
    outcome: payment.status === "paid" ? "payment_confirmed" : "payment_pending",
    details: JSON.stringify({ ...JSON.parse(auditDetails(decision)), paymentId: payment.providerPaymentId, provider: order.provider, providerStatus: payment.status }),
  });
  return { status: payment.status, policy: decision, order: settledOrder };
}
