import { isInternalAccountEmail, isTestAccountUsername, normalizeEmail } from "@/lib/prototype-auth";
import { resolveReturnToHomeAccess } from "@/lib/return-to-home-access-policy";
import { supabaseRequest } from "@/lib/supabase-server";

export const RETURN_TO_HOME_FEATURE_CODE = "navi_return_to_home";

export const returnToHomeFeature = {
  code: RETURN_TO_HOME_FEATURE_CODE,
  name: "Navi Return to Home",
  includedWithMonthlySubscription: true,
  oneTimePurchase: true
} as const;

type SubscriptionRecord = {
  status: string;
  current_period_end: string | null;
};

type FeatureEntitlementRecord = {
  status: string;
  expires_at: string | null;
};

type FeaturePaymentRecord = {
  id: number;
  email: string;
  feature_code: string;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
};

export function getReturnToHomePriceCents() {
  const value = Number(process.env.AGENTECH_RETURN_TO_HOME_PRICE_CENTS || "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function getReturnToHomeAccess(emailValue: string) {
  const email = normalizeEmail(emailValue);
  if (!email) {
    return resolveReturnToHomeAccess({ internal: false });
  }

  // Company and the eight teaching accounts have this SDK feature for testing.
  if (isInternalAccountEmail(email) || isTestAccountUsername(email)) {
    return resolveReturnToHomeAccess({ internal: true });
  }

  const [subscriptions, entitlements] = await Promise.all([
    supabaseRequest<SubscriptionRecord[]>("agentech_subscriptions", {
      query: `email=eq.${encodeURIComponent(email)}&status=in.(active,trialing)&select=status,current_period_end&order=created_at.desc&limit=1`
    }).catch(() => []),
    supabaseRequest<FeatureEntitlementRecord[]>("agentech_feature_entitlements", {
      query: `email=eq.${encodeURIComponent(email)}&feature_code=eq.${RETURN_TO_HOME_FEATURE_CODE}&status=eq.active&select=status,expires_at&limit=1`
    }).catch(() => [])
  ]);

  return resolveReturnToHomeAccess({
    internal: false,
    subscriptions: subscriptions.map((item) => ({
      status: item.status,
      endsAt: item.current_period_end
    })),
    entitlements: entitlements.map((item) => ({
      status: item.status,
      endsAt: item.expires_at
    }))
  });
}

export async function createFeaturePayment(input: {
  email: string;
  amountCents: number;
  stripeSessionId: string;
}) {
  const rows = await supabaseRequest<FeaturePaymentRecord[]>("agentech_feature_payments", {
    method: "POST",
    body: {
      email: normalizeEmail(input.email),
      feature_code: RETURN_TO_HOME_FEATURE_CODE,
      amount_cents: input.amountCents,
      currency: "usd",
      status: "pending",
      stripe_checkout_session_id: input.stripeSessionId,
      stripe_payment_intent_id: null,
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function fulfillFeaturePayment(input: {
  stripeSessionId: string;
  paymentIntentId?: string | null;
}) {
  const rows = await supabaseRequest<FeaturePaymentRecord[]>("agentech_feature_payments", {
    query: `stripe_checkout_session_id=eq.${encodeURIComponent(input.stripeSessionId)}&feature_code=eq.${RETURN_TO_HOME_FEATURE_CODE}&select=*&limit=1`
  });
  const payment = rows[0] ?? null;
  if (!payment) return null;

  if (payment.status !== "paid") {
    await supabaseRequest<null>("agentech_feature_entitlements", {
      method: "POST",
      query: "on_conflict=email,feature_code",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        email: payment.email,
        feature_code: RETURN_TO_HOME_FEATURE_CODE,
        status: "active",
        source: "one_time_purchase",
        expires_at: null,
        updated_at: new Date().toISOString()
      }
    });

    await supabaseRequest<null>("agentech_feature_payments", {
      method: "PATCH",
      query: `stripe_checkout_session_id=eq.${encodeURIComponent(input.stripeSessionId)}`,
      prefer: "return=minimal",
      body: {
        status: "paid",
        stripe_payment_intent_id: input.paymentIntentId || null,
        updated_at: new Date().toISOString()
      }
    });
  }

  return payment;
}
