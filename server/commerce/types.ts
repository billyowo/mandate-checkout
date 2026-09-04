export const AGENT_TOOLS = [
  "get_catalog",
  "quote",
  "create_order",
  "confirm_payment",
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export type PolicyDecision = {
  result: "allowed" | "refused";
  code: string;
  explanation: string;
  remainingSpendPaise: number;
  checks: Array<{ key: string; label: string; result: "pass" | "fail"; detail: string }>;
};

export type PolicyMandate = {
  id: string;
  merchantAllowlist: string[];
  spendCapPaise: number;
  spentPaise: number;
  reservedPaise: number;
  expiresAt: Date;
  status: "active" | "expired" | "suspended";
};

export type PolicyProduct = {
  merchantId: string;
  sku: string;
  pricePaise: number;
  stock: number;
  active: boolean;
};

export type PolicyQuote = {
  mandateId: string;
  merchantId: string;
  sku: string;
  amountPaise: number;
  status: "allowed" | "refused";
  expiresAt: Date;
};

export type PolicyOrder = {
  mandateId: string;
  sku: string;
  amountPaise: number;
  status: "created" | "payment_pending" | "paid" | "failed" | "refused";
};

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
