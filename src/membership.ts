import { Membership } from "./types";

export const FULL_ACCESS_ENTITLEMENT = "farrieros.full_access";

export const fullAccessPlan: Membership = {
  planId: "farrieros_full_monthly",
  planName: "FarrierOS Full Access",
  priceMonthlyCents: 799,
  currency: "usd",
  status: "development",
  entitlements: [FULL_ACCESS_ENTITLEMENT],
  billingProvider: "development",
};

export function hasFullAccess(membership: Membership, now = new Date()) {
  if (!membership.entitlements.includes(FULL_ACCESS_ENTITLEMENT)) return false;
  if (["development", "trialing", "active"].includes(membership.status)) return true;
  if (membership.status !== "grace_period" || !membership.currentPeriodEnd) return false;
  return new Date(membership.currentPeriodEnd).getTime() > now.getTime();
}

export function formatMonthlyPrice(membership: Membership) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: membership.currency }).format(
    membership.priceMonthlyCents / 100,
  );
}
