import { BILLING_PLANS, BillingPlanId } from "./billing";

export type VirtualProductId = "plus" | "pro";

export type VirtualPaymentProduct = {
  productId: VirtualProductId;
  plan: BillingPlanId;
  name: string;
  amountCents: number;
  points: number;
  maxQuantity: 1;
};

function catalog(): Readonly<Record<VirtualProductId, VirtualPaymentProduct>> {
  return Object.freeze({
    plus: Object.freeze({
      productId: "plus",
      plan: "plus",
      name: BILLING_PLANS.plus.name,
      amountCents: BILLING_PLANS.plus.amountCents,
      points: BILLING_PLANS.plus.pointsPerCycle,
      maxQuantity: 1,
    }),
    pro: Object.freeze({
      productId: "pro",
      plan: "pro",
      name: BILLING_PLANS.pro.name,
      amountCents: BILLING_PLANS.pro.amountCents,
      points: BILLING_PLANS.pro.pointsPerCycle,
      maxQuantity: 1,
    }),
  });
}

export function getVirtualProduct(value: unknown): VirtualPaymentProduct | null {
  const id = String(value || "").trim() as VirtualProductId;
  return catalog()[id] || null;
}
