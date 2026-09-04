import { AGENT_TOOLS, type AgentTool, type PolicyDecision, type PolicyMandate, type PolicyOrder, type PolicyProduct, type PolicyQuote } from "./types";

type PolicyInput = {
  action: AgentTool;
  mandate?: PolicyMandate | null;
  product?: PolicyProduct | null;
  quote?: PolicyQuote | null;
  order?: PolicyOrder | null;
  now?: Date;
};

function decision(
  result: PolicyDecision["result"],
  code: string,
  explanation: string,
  remainingSpendPaise: number,
  checks: PolicyDecision["checks"],
): PolicyDecision {
  return { result, code, explanation, remainingSpendPaise, checks };
}

function refusal(
  code: string,
  explanation: string,
  remainingSpendPaise: number,
  checks: PolicyDecision["checks"],
) {
  return decision("refused", code, explanation, remainingSpendPaise, checks);
}

export function getRemainingSpend(mandate?: PolicyMandate | null) {
  if (!mandate) return 0;
  return Math.max(0, mandate.spendCapPaise - mandate.spentPaise - mandate.reservedPaise);
}

/**
 * A deterministic policy gate used before every money-adjacent tool. The agent can request
 * a tool call, but it cannot bypass this function or access a general charge endpoint.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const now = input.now ?? new Date();
  const { action, mandate, product, quote, order } = input;

  if (!AGENT_TOOLS.includes(action)) {
    return refusal("TOOL_NOT_ALLOWED", "The requested action is outside the approved checkout toolset.", 0, [
      { key: "tool", label: "Bounded tool", result: "fail", detail: action },
    ]);
  }

  if (action === "get_catalog") {
    return decision("allowed", "CATALOG_READ_ALLOWED", "Catalog access is read-only and within the approved toolset.", 0, [
      { key: "tool", label: "Bounded tool", result: "pass", detail: "get_catalog" },
      { key: "money", label: "Money movement", result: "pass", detail: "No money-adjacent action requested" },
    ]);
  }

  if (!mandate) {
    return refusal("MANDATE_NOT_FOUND", "A valid buyer mandate is required before this action can continue.", 0, [
      { key: "mandate", label: "Buyer mandate", result: "fail", detail: "No mandate found" },
    ]);
  }

  const remainingSpendPaise = getRemainingSpend(mandate);
  const commonChecks: PolicyDecision["checks"] = [
    { key: "tool", label: "Bounded tool", result: "pass", detail: action },
    {
      key: "mandate-status",
      label: "Mandate status",
      result: mandate.status === "active" ? "pass" : "fail",
      detail: mandate.status,
    },
    {
      key: "mandate-expiry",
      label: "Mandate expiry",
      result: mandate.expiresAt.getTime() > now.getTime() ? "pass" : "fail",
      detail: mandate.expiresAt.toISOString(),
    },
  ];

  if (mandate.status !== "active") {
    return refusal("MANDATE_INACTIVE", "The buyer mandate is not active.", remainingSpendPaise, commonChecks);
  }
  if (mandate.expiresAt.getTime() <= now.getTime()) {
    return refusal("MANDATE_EXPIRED", "The buyer mandate has expired and cannot authorize a purchase.", remainingSpendPaise, commonChecks);
  }

  if (action === "confirm_payment") {
    if (!order) {
      return refusal("ORDER_NOT_FOUND", "A created order is required before payment can be confirmed.", remainingSpendPaise, commonChecks);
    }
    const canConfirm = order.status === "created" || order.status === "payment_pending";
    const checks = [
      ...commonChecks,
      {
        key: "order-state",
        label: "Order state",
        result: canConfirm ? "pass" as const : "fail" as const,
        detail: order.status,
      },
    ];
    return canConfirm
      ? decision("allowed", "PAYMENT_CONFIRMATION_ALLOWED", "The order remains within its approved mandate reservation.", remainingSpendPaise, checks)
      : refusal("ORDER_NOT_CONFIRMABLE", "Only a created or payment-pending order can be confirmed.", remainingSpendPaise, checks);
  }

  if (!product) {
    return refusal("SKU_NOT_FOUND", "The requested SKU is not available in the merchant catalog.", remainingSpendPaise, commonChecks);
  }

  const merchantAllowed = mandate.merchantAllowlist.includes(product.merchantId);
  const stockAvailable = product.active && product.stock > 0;
  const productChecks: PolicyDecision["checks"] = [
    ...commonChecks,
    {
      key: "merchant-allowlist",
      label: "Merchant allowlist",
      result: merchantAllowed ? "pass" : "fail",
      detail: product.merchantId,
    },
    {
      key: "stock",
      label: "Live stock",
      result: stockAvailable ? "pass" : "fail",
      detail: stockAvailable ? `${product.stock} units available` : "SKU inactive or out of stock",
    },
  ];
  if (!merchantAllowed) {
    return refusal("MERCHANT_NOT_ALLOWED", "This merchant is not on the buyer mandate allowlist.", remainingSpendPaise, productChecks);
  }
  if (!stockAvailable) {
    return refusal("STOCK_UNAVAILABLE", "The selected SKU is not available for purchase.", remainingSpendPaise, productChecks);
  }

  if (action === "create_order") {
    const quoteValid = Boolean(
      quote &&
        quote.status === "allowed" &&
        quote.mandateId === mandate.id &&
        quote.merchantId === product.merchantId &&
        quote.sku === product.sku &&
        quote.amountPaise === product.pricePaise &&
        quote.expiresAt.getTime() > now.getTime(),
    );
    const quoteCheck = {
      key: "quote-integrity",
      label: "Quote integrity",
      result: quoteValid ? "pass" as const : "fail" as const,
      detail: quoteValid ? "Approved quote matches SKU, merchant, price, and mandate" : "Quote is missing, expired, refused, or no longer matches",
    };
    if (!quoteValid) {
      return refusal("QUOTE_INVALID", "A current approved quote is required before an order can be created.", remainingSpendPaise, [...productChecks, quoteCheck]);
    }
  }

  const withinCap = product.pricePaise <= remainingSpendPaise;
  const capCheck = {
    key: "spend-cap",
    label: "Remaining mandate spend",
    result: withinCap ? "pass" as const : "fail" as const,
    detail: `${product.pricePaise} requested against ${remainingSpendPaise} remaining`,
  };
  if (!withinCap) {
    return refusal(
      "SPEND_CAP_EXCEEDED",
      "The quote exceeds the spend remaining under the buyer mandate; no order or payment action was created.",
      remainingSpendPaise,
      [...productChecks, capCheck],
    );
  }

  return decision(
    "allowed",
    action === "quote" ? "QUOTE_ALLOWED" : "ORDER_CREATION_ALLOWED",
    action === "quote"
      ? "The SKU is available and its price remains within the active buyer mandate."
      : "The approved quote remains valid and the order can reserve the mandate amount.",
    remainingSpendPaise,
    [...productChecks, capCheck],
  );
}
