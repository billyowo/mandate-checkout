import axios from "axios";
import { nanoid } from "nanoid";

type ProviderOrder = {
  provider: "demo" | "razorpay";
  providerOrderId: string;
};

type PaymentResolution = {
  status: "paid" | "payment_pending";
  providerPaymentId: string | null;
};

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function authorizationHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/**
 * The browser never calls Razorpay and never receives a secret. If test keys have not been
 * configured, this deliberately produces a clear server-side demo reference rather than a
 * fictitious Razorpay identifier.
 */
export async function createProviderOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder> {
  const auth = credentials();
  if (!auth) {
    return { provider: "demo", providerOrderId: `order_demo_${nanoid(10)}` };
  }

  try {
    const response = await axios.post<{ id: string }>(
      "https://api.razorpay.com/v1/orders",
      {
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes,
      },
      { headers: { Authorization: authorizationHeader(auth.keyId, auth.keySecret), "Content-Type": "application/json" }, timeout: 12_000 },
    );
    if (!response.data?.id) throw new Error("Razorpay did not return an order identifier.");
    return { provider: "razorpay", providerOrderId: response.data.id };
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? `Razorpay order creation failed (${error.response?.status ?? "network"}).`
      : "Razorpay order creation failed.";
    throw new Error(message);
  }
}

/**
 * A real order is settled only after Razorpay reports a captured payment. The agent cannot
 * directly mark an order as paid; in demo mode only, the lifecycle is simulated for presentation.
 */
export async function resolveProviderPayment(input: { provider: "demo" | "razorpay"; providerOrderId: string }): Promise<PaymentResolution> {
  if (input.provider === "demo") {
    return { status: "paid", providerPaymentId: `pay_demo_${nanoid(10)}` };
  }

  const auth = credentials();
  if (!auth) throw new Error("Razorpay keys are required to verify a Razorpay order.");
  try {
    const response = await axios.get<{ items?: Array<{ id: string; status: string; captured?: boolean }> }>(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(input.providerOrderId)}/payments`,
      { headers: { Authorization: authorizationHeader(auth.keyId, auth.keySecret) }, timeout: 12_000 },
    );
    const captured = response.data.items?.find(payment => payment.status === "captured" || payment.captured === true);
    return captured
      ? { status: "paid", providerPaymentId: captured.id }
      : { status: "payment_pending", providerPaymentId: null };
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? `Razorpay payment verification failed (${error.response?.status ?? "network"}).`
      : "Razorpay payment verification failed.";
    throw new Error(message);
  }
}

export function isRazorpayConfigured() {
  return Boolean(credentials());
}
